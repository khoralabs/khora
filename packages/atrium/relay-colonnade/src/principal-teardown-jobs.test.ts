import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import {
  ensurePrincipalTeardownJobsSchema,
  insertPendingPrincipalTeardownJob,
  principalHasActiveTeardownJob,
  tryClaimNextPendingPrincipalTeardownJob,
} from "./principal-teardown-jobs.ts";

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
