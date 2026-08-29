import { Database } from "bun:sqlite";
import { runHostPersistenceContractTests } from "../core/contract";
import { createKhoraInvitesSqliteRepo } from "./invites/sqlite";
import { createKhoraHostSqlitePersistence } from "./khora-persistence";
import { ensureKhoraHostProjectionsSchema } from "./sqlite-setup";
import { ensurePrincipalTeardownJobsSchema } from "./teardown-queue";

runHostPersistenceContractTests("sqlite", () => {
  const db = new Database(":memory:");
  ensureKhoraHostProjectionsSchema(db);
  ensurePrincipalTeardownJobsSchema(db);
  return {
    persistence: createKhoraHostSqlitePersistence(db),
    invites: createKhoraInvitesSqliteRepo(db, "contract-pepper"),
  };
});
