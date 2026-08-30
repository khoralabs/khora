import type { Database } from "bun:sqlite";
import type { KhoraAdminStatsPort } from "@khoralabs/khora-host";
import { countRegisteredPrincipals } from "@khoralabs/khora-host/sqlite";

export function createKhoraAdminStatsPort(deps: {
  hostDb: Database;
  tenantKey: string;
}): KhoraAdminStatsPort {
  return {
    registeredPrincipalCount(): number {
      return countRegisteredPrincipals(deps.hostDb, deps.tenantKey);
    },
  };
}
