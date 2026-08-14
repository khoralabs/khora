import type { Database } from "bun:sqlite";
import type { AdminTokenAuth } from "@khoralabs/admin-token";
import type {
  MemoriesDatabaseCatalogStore,
  MemoriesDatabaseOntologyStore,
  MemoriesDatabaseService,
} from "@khoralabs/memories-service";
import type { KhoraHostContext } from "../..";
import type { V2HostRateLimiters } from "../rate-limit-buckets";

export type HostRouteDeps = {
  ctx: KhoraHostContext;
  /** Shared Domus SQLite handle for embedding-queue host routes (same as service/indexer). */
  memoriesSqliteDb?: Database;
  /** Domus memories-service (when memories enabled). */
  memoriesService?: MemoriesDatabaseService;
  memoriesOntology?: MemoriesDatabaseOntologyStore;
  memoriesCatalog?: MemoriesDatabaseCatalogStore;
  rateLimiters: V2HostRateLimiters;
  adminTokenAuth: AdminTokenAuth | null;
};
