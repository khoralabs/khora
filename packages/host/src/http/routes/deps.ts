import type { Database } from "bun:sqlite";
import type { AdminTokenAuth } from "@khoralabs/khora-auth";
import type {
  MemoriesDatabaseCatalogStore,
  MemoriesDatabaseOntologyStore,
  MemoriesDatabaseService,
} from "@khoralabs/memories-service";
import type { KhoraHostContext } from "../..";
import type { V2HostRateLimiters } from "../rate-limit-buckets";

export type HostRouteDeps = {
  ctx: KhoraHostContext;
  /** Shared host memories SQLite handle for embedding-queue host routes (same as service/indexer). */
  memoriesSqliteDb?: Database;
  /** Host memories-service (when memories enabled). */
  memoriesService?: MemoriesDatabaseService;
  memoriesOntology?: MemoriesDatabaseOntologyStore;
  memoriesCatalog?: MemoriesDatabaseCatalogStore;
  rateLimiters: V2HostRateLimiters;
  adminTokenAuth: AdminTokenAuth | null;
};
