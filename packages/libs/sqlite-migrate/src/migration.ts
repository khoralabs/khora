import type { Database } from "bun:sqlite";

/** A single SQLite schema/data migration bridging one semver to the next. */
export interface Migration {
  /** Semver this migration starts from, e.g. "0.1.0". */
  from: string;
  /** Semver this migration bridges to, e.g. "0.2.0". */
  to: string;
  /** Stable id within the (from, to) pair; used for tracking. */
  name: string;
  up(db: Database): void | Promise<void>;
}

/** Record of a migration that has been applied (or is already recorded) on a DB. */
export interface AppliedMigration {
  from: string;
  to: string;
  name: string;
  appliedAt: number;
}

export interface MigrationResult {
  applied: AppliedMigration[];
  skipped: AppliedMigration[];
  /** Highest `to` semver across the input list, or `null` if the input was empty. */
  finalVersion: string | null;
}
