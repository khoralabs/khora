import type { Database } from "bun:sqlite";
import type { KhoraAdminStatsPort } from "../../ports";
import { countRegisteredPrincipals } from "./count-registered-principals";

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
