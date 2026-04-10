import type { Database } from "bun:sqlite";

/** Passed through the data layer for writes (single `now` per operation / transaction). */
export type DbCtx = {
  db: Database;
  now: number;
};
