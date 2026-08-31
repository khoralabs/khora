import type { Database } from "bun:sqlite";
import { createAdminTokenAuthFromEnv } from "@khoralabs/khora-auth";
import type {
  MemoriesDatabaseCatalogStore,
  MemoriesDatabaseOntologyStore,
  MemoriesDatabaseService,
} from "@khoralabs/memories-service";
import type { KhoraHostContext } from "../..";
import { createV2HostRateLimiters } from "../rate-limit-buckets";
import type { HostRouteDeps } from "../routes/deps";

export type CreateHostRouteDepsFromEnvOpts = {
  ctx: KhoraHostContext;
  memoriesSqliteDb?: Database;
  memoriesService?: MemoriesDatabaseService;
  memoriesOntology?: MemoriesDatabaseOntologyStore;
  memoriesCatalog?: MemoriesDatabaseCatalogStore;
};

export type HostRouteDepsFromEnv = {
  deps: HostRouteDeps;
  /** True when ADMIN_ROOT_TOKEN / KHORA_CONSOLE_ROOT_TOKEN (or auth package equivalents) is set. */
  adminTokenAuthEnabled: boolean;
};

/**
 * Build {@link HostRouteDeps} from a host context plus optional memories handles.
 * Reads admin token from env via `@khoralabs/khora-auth`; does not open databases.
 */
export function createHostRouteDepsFromEnv(
  opts: CreateHostRouteDepsFromEnvOpts,
): HostRouteDepsFromEnv {
  const adminTokenAuth = createAdminTokenAuthFromEnv();
  const deps: HostRouteDeps = {
    ctx: opts.ctx,
    ...(opts.memoriesSqliteDb !== undefined ? { memoriesSqliteDb: opts.memoriesSqliteDb } : {}),
    ...(opts.memoriesService !== undefined ? { memoriesService: opts.memoriesService } : {}),
    ...(opts.memoriesOntology !== undefined ? { memoriesOntology: opts.memoriesOntology } : {}),
    ...(opts.memoriesCatalog !== undefined ? { memoriesCatalog: opts.memoriesCatalog } : {}),
    rateLimiters: createV2HostRateLimiters(),
    adminTokenAuth,
  };
  return {
    deps,
    adminTokenAuthEnabled: adminTokenAuth !== null,
  };
}
