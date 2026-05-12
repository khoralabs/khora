import type { Database } from "bun:sqlite";
import { createMigrationRunner } from "@khoralabs/sqlite-migrate";
import m001Initial from "./migrations/0.0.0-0.1.0/001-initial.ts";
import m002AddGoals from "./migrations/0.1.0-0.2.0/001-add-goals.ts";
import m003AddRunSummaries from "./migrations/0.2.0-0.3.0/001-add-run-summaries.ts";

const migrations = [m001Initial, m002AddGoals, m003AddRunSummaries];

/** Idempotent: applies any pending matchmaking domain DB migrations. */
export function migrateMatchmakingDomainDb(db: Database): void {
  createMigrationRunner().runSync(db, migrations);
}
