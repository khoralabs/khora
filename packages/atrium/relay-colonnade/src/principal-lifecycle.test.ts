import { Database } from "bun:sqlite";
import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentRelayPersistence } from "@khoralabs/agent-relay";
import { createSqliteColonnadeCluster } from "@khoralabs/colonnade-persistence";
import { createRelayColonnadeSocial } from "./create-relay-colonnade-social.ts";
import {
  createRelayPrincipalLifecycle,
  type RelayPrincipalLifecycle,
} from "./principal-lifecycle.ts";
import {
  ensurePrincipalTeardownJobsSchema,
  insertPendingPrincipalTeardownJob,
  principalHasActiveTeardownJob,
} from "./principal-teardown-jobs.ts";
import { registerAgentOnColonnadePersistence } from "./social-registration.ts";

function lifecycleWithMockPersistence(
  catalogDb: Database,
  persistence: AgentRelayPersistence,
): RelayPrincipalLifecycle {
  return createRelayPrincipalLifecycle({
    catalogDb,
    framesDb: new Database(":memory:"),
    projectionStore: {
      lookupProjection: () => ({ found: false, projection: null }),
      deleteRow: () => {},
      upsert: () => {},
    } as never,
    subscriptionEdgeStore: {
      listSubjectsWithPrefix: () => [],
    } as never,
    principalChannelStore: {} as never,
    persistence,
    tenantKey: "tn",
    cluster: createSqliteColonnadeCluster({
      cellsDirectory: mkdtempSync(join(tmpdir(), "lc-cells-")),
      mode: { kind: "pool", cellCount: 2 },
      useCellWorkers: false,
    }),
  });
}

test("isPostPointerDeliverable false when teardown job active", () => {
  const db = new Database(":memory:");
  ensurePrincipalTeardownJobsSchema(db);
  const persistence = {
    agentRegistrations: { exists: () => true },
  } as unknown as AgentRelayPersistence;
  insertPendingPrincipalTeardownJob(db, { did: "did:x", profileId: "p", nowMs: 1 });
  const lifecycle = lifecycleWithMockPersistence(db, persistence);
  expect(lifecycle.isPostPointerDeliverable("did:x")).toBe(false);
});

test("isPostPointerDeliverable true when registered and no job", () => {
  const db = new Database(":memory:");
  ensurePrincipalTeardownJobsSchema(db);
  const persistence = {
    agentRegistrations: { exists: (id: string) => id === "did:x" },
  } as unknown as AgentRelayPersistence;
  const lifecycle = lifecycleWithMockPersistence(db, persistence);
  expect(lifecycle.isPostPointerDeliverable("did:x")).toBe(true);
});

test("isPostPointerDeliverable false when authorPrincipalId missing", () => {
  const db = new Database(":memory:");
  ensurePrincipalTeardownJobsSchema(db);
  const persistence = {
    agentRegistrations: { exists: () => true },
  } as unknown as AgentRelayPersistence;
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
  const dir = nextDir();
  const {
    persistence,
    projectionStore,
    subscriptionEdgeStore,
    principalChannelStore,
    catalogDb,
    tenantKey,
    framesDb,
  } = await createRelayColonnadeSocial({
    catalogPath: join(dir, "c.sqlite"),
    framesDbPath: join(dir, "f.sqlite"),
    tenantKey: "tn",
  });
  const cluster = createSqliteColonnadeCluster({
    cellsDirectory: join(dir, "cells"),
    mode: { kind: "pool", cellCount: 2 },
    useCellWorkers: false,
  });
  const lifecycle = createRelayPrincipalLifecycle({
    catalogDb,
    framesDb,
    projectionStore,
    subscriptionEdgeStore,
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
  expect(persistence.agentRegistrations.exists("did:author")).toBe(true);
  expect(lifecycle.enqueueTeardown("did:author")).toBe(true);
  expect(persistence.agentRegistrations.exists("did:author")).toBe(false);
  expect(principalHasActiveTeardownJob(catalogDb, "did:author")).toBe(true);
  expect(lifecycle.isPostPointerDeliverable("did:author")).toBe(false);

  expect(await lifecycle.runNextTeardownJob()).toBe(true);
  expect(principalHasActiveTeardownJob(catalogDb, "did:author")).toBe(false);

  cluster.close();
});
