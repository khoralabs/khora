import type { Database } from "bun:sqlite";
import type { ConsoleAuth } from "@khoralabs/admin-token";
import type { KhoraHostContext } from "@khoralabs/khora-host";
import type { V2HostRateLimiters } from "../rate-limit-buckets";

export type HostRouteDeps = {
  ctx: KhoraHostContext;
  /** SQLite memories DB for admin routes and embedding retry (server sqlite backend only). */
  memoriesSqliteDb?: Database;
  rateLimiters: V2HostRateLimiters;
  consoleAuth: ConsoleAuth | null;
};
