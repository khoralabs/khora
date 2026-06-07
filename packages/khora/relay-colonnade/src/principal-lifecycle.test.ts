import { Database } from "bun:sqlite";
import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyTestEncryptionEnv,
  createTestEncryptionMaterial,
  TestKeyProvider,
} from "@khoralabs/colonnade-crypto";
import { createSqliteColonnadeCluster } from "@khoralabs/colonnade-persistence";
import type { HostPersistence } from "@khoralabs/host-runtime";
import { InMemoryFrameRelayStoreStrategy } from "@khoralabs/obp-frame-relay";
import { createRelayColonnadeSocial } from "./create-relay-colonnade-social";
import { createRelayPrincipalLifecycle, type RelayPrincipalLifecycle } from "./principal-lifecycle";
import {
  ensurePrincipalTeardownJobsSchema,
  insertPendingPrincipalTeardownJob,
  principalHasActiveTeardownJob,
} from "./principal-teardown-jobs";
import { registerAgentOnColonnadePersistence } from "./social-registration";

function lifecycleWithMockPersistence(
  catalogDb: Database,
  persistence: HostPersistence,
): RelayPrincipalLifecycle {
  const encryption = createTestEncryptionMaterial();
  return createRelayPrincipalLifecycle({
    catalogDb,
    frameRelayStore: new InMemoryFrameRelayStoreStrategy(),
    projectionStore: {
      lookupProjection: () => ({ found: false, projection: null }),
      deleteRow: () => {},
      upsert: () => {},
    } as never,
    principalChannelStore: {} as never,
    persistence,
    tenantKey: "tn",
    cluster: createSqliteColonnadeCluster({
      cellsDirectory: mkdtempSync(join(tmpdir(), "lc-cells-")),
      mode: { kind: "pool", cellCount: 2 },
      useCellWorkers: false,
      encryption: {
        sqlCipherKey: encryption.sqlCipherKey,
        outboxPayloadCodec: encryption.outboxPayloadCodec,
        outboxKeyHex: encryption.outboxKeyHex,
      },
    }),
  });
}

test("isPostPointerDeliverable false when teardown job active", () => {
  const db = new Database(":memory:");
  ensurePrincipalTeardownJobsSchema(db);
  const persistence = {
    registrations: { exists: () => true },
  } as unknown as HostPersistence;
  insertPendingPrincipalTeardownJob(db, { did: "did:x", profileId: "p", nowMs: 1 });
  const lifecycle = lifecycleWithMockPersistence(db, persistence);
  expect(lifecycle.isPostPointerDeliverable("did:x")).toBe(false);
});

test("isPostPointerDeliverable true when registered and no job", () => {
  const db = new Database(":memory:");
  ensurePrincipalTeardownJobsSchema(db);
  const persistence = {
    registrations: { exists: (id: string) => id === "did:x" },
  } as unknown as HostPersistence;
  const lifecycle = lifecycleWithMockPersistence(db, persistence);
  expect(lifecycle.isPostPointerDeliverable("did:x")).toBe(true);
});

test("isPostPointerDeliverable false when authorPrincipalId missing", () => {
  const db = new Database(":memory:");
  ensurePrincipalTeardownJobsSchema(db);
  const persistence = {
    registrations: { exists: () => true },
  } as unknown as HostPersistence;
  const lifecycle = lifecycleWithMockPersistence(db, persistence);
  expect(lifecycle.isPostPointerDeliverable(undefined)).toBe(false);
});

const tmpRoot = mkdtempSync(join(tmpdir(), "relay-lifecycle-int-"));
let seq = 0;
function nextDir(): string {
  const d = join(tmpRoot, `r${seq++}`);
  mkdirSync(d, { recursive: true });
  return d;
}

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

test("enqueueTeardown clears registration and enqueues job; runNextTeardownJob finishes", async () => {
  applyTestEncryptionEnv();
  const dir = nextDir();
  const encryptionProvider = new TestKeyProvider();
  const {
    persistence,
    projectionStore,
    principalChannelStore,
    catalogDb,
    tenantKey,
    frameRelayStore,
  } = await createRelayColonnadeSocial({
    catalogPath: join(dir, "c.sqlite"),
    framesDbPath: join(dir, "f.sqlite"),
    tenantKey: "tn",
    encryptionProvider,
  });
  const encryption = createTestEncryptionMaterial();
  const cluster = createSqliteColonnadeCluster({
    cellsDirectory: join(dir, "cells"),
    mode: { kind: "pool", cellCount: 2 },
    useCellWorkers: false,
    encryption: {
      sqlCipherKey: encryption.sqlCipherKey,
      outboxPayloadCodec: encryption.outboxPayloadCodec,
      outboxKeyHex: encryption.outboxKeyHex,
    },
  });
  const lifecycle = createRelayPrincipalLifecycle({
    catalogDb,
    frameRelayStore,
    projectionStore,
    principalChannelStore,
    persistence,
    tenantKey,
    cluster,
  });

  registerAgentOnColonnadePersistence(persistence, catalogDb, projectionStore, {
    principalId: "did:author",
    username: "author",
    profileUpsert: { id: "prof-a", bodyJson: "{}" },
  });
  expect(persistence.registrations.exists("did:author")).toBe(true);
  expect(lifecycle.enqueueTeardown("did:author")).toBe(true);
  expect(persistence.registrations.exists("did:author")).toBe(false);
  expect(principalHasActiveTeardownJob(catalogDb, "did:author")).toBe(true);
  expect(lifecycle.isPostPointerDeliverable("did:author")).toBe(false);

  expect(await lifecycle.runNextTeardownJob()).toBe(true);
  expect(principalHasActiveTeardownJob(catalogDb, "did:author")).toBe(false);

  cluster.close();
});
