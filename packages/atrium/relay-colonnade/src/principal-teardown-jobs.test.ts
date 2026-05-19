import { Database } from "bun:sqlite";
import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentRelayPersistence } from "@khoralabs/agent-relay";
import { createRelayColonnadeSocial } from "./create-relay-colonnade-social.ts";
import {
  deletePrincipalTeardownJob,
  ensurePrincipalTeardownJobsSchema,
  insertPendingPrincipalTeardownJob,
  principalHasActiveTeardownJob,
  relayInboxAuthorPointerDeliverable,
  tryClaimNextPendingPrincipalTeardownJob,
} from "./principal-teardown-jobs.ts";
import { registerAgentOnColonnadePersistence } from "./social-registration.ts";
import {
  cascadeUnregisterColonnadePrincipalWithProfile,
  phase1UnregisterColonnadePrincipal,
} from "./social-unregister.ts";

test("tryClaimNextPendingPrincipalTeardownJob claims one pending row", () => {
  const db = new Database(":memory:");
  ensurePrincipalTeardownJobsSchema(db);
  insertPendingPrincipalTeardownJob(db, { did: "did:a", profileId: "prof-a", nowMs: 10 });
  const claimed = tryClaimNextPendingPrincipalTeardownJob(db, 20);
  expect(claimed).toEqual({ did: "did:a", profileId: "prof-a" });
  const row = db.prepare(`SELECT state FROM principal_teardown_jobs WHERE did = 'did:a'`).get() as {
    state: string;
  };
  expect(row.state).toBe("running");
});

test("principalHasActiveTeardownJob is true for pending and running", () => {
  const db = new Database(":memory:");
  ensurePrincipalTeardownJobsSchema(db);
  expect(principalHasActiveTeardownJob(db, "did:x")).toBe(false);
  insertPendingPrincipalTeardownJob(db, { did: "did:x", profileId: "p", nowMs: 1 });
  expect(principalHasActiveTeardownJob(db, "did:x")).toBe(true);
  db.prepare(`UPDATE principal_teardown_jobs SET state = 'running' WHERE did = 'did:x'`).run();
  expect(principalHasActiveTeardownJob(db, "did:x")).toBe(true);
  db.prepare(`UPDATE principal_teardown_jobs SET state = 'completed' WHERE did = 'did:x'`).run();
  expect(principalHasActiveTeardownJob(db, "did:x")).toBe(false);
});

test("relayInboxAuthorPointerDeliverable false when teardown job active", () => {
  const db = new Database(":memory:");
  ensurePrincipalTeardownJobsSchema(db);
  const persistence = {
    agentRegistrations: {
      exists: () => true,
    },
  } as unknown as AgentRelayPersistence;
  insertPendingPrincipalTeardownJob(db, { did: "did:x", profileId: "p", nowMs: 1 });
  expect(
    relayInboxAuthorPointerDeliverable({
      catalogDb: db,
      persistence,
      authorPrincipalId: "did:x",
    }),
  ).toBe(false);
});

test("relayInboxAuthorPointerDeliverable true when registered and no job", () => {
  const db = new Database(":memory:");
  ensurePrincipalTeardownJobsSchema(db);
  const persistence = {
    agentRegistrations: {
      exists: (id: string) => id === "did:x",
    },
  } as unknown as AgentRelayPersistence;
  expect(
    relayInboxAuthorPointerDeliverable({
      catalogDb: db,
      persistence,
      authorPrincipalId: "did:x",
    }),
  ).toBe(true);
});

test("relayInboxAuthorPointerDeliverable false when authorPrincipalId missing", () => {
  const db = new Database(":memory:");
  ensurePrincipalTeardownJobsSchema(db);
  const persistence = {
    agentRegistrations: { exists: () => true },
  } as unknown as AgentRelayPersistence;
  expect(
    relayInboxAuthorPointerDeliverable({
      catalogDb: db,
      persistence,
      authorPrincipalId: undefined,
    }),
  ).toBe(false);
});

const tmpRoot = mkdtempSync(join(tmpdir(), "relay-teardown-int-"));
let seq = 0;
function nextDir(): string {
  const d = join(tmpRoot, `r${seq++}`);
  mkdirSync(d, { recursive: true });
  return d;
}

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

test("phase1 clears registration and enqueues job; cascade + delete job finishes", async () => {
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
  registerAgentOnColonnadePersistence(persistence, catalogDb, projectionStore, {
    principalId: "did:author",
    username: "author",
    profileUpsert: { id: "prof-a", bodyJson: "{}" },
  });
  expect(persistence.agentRegistrations.exists("did:author")).toBe(true);
  expect(
    phase1UnregisterColonnadePrincipal({
      persistence,
      projectionStore,
      catalogDb,
      tenantKey,
      principalId: "did:author",
    }),
  ).toBe(true);
  expect(persistence.agentRegistrations.exists("did:author")).toBe(false);
  expect(principalHasActiveTeardownJob(catalogDb, "did:author")).toBe(true);

  cascadeUnregisterColonnadePrincipalWithProfile({
    persistence,
    projectionStore,
    subscriptionEdgeStore,
    principalChannelStore,
    catalogDb,
    framesDb,
    tenantKey,
    principalId: "did:author",
    profileId: "prof-a",
  });
  deletePrincipalTeardownJob(catalogDb, "did:author");
  expect(principalHasActiveTeardownJob(catalogDb, "did:author")).toBe(false);
});
