import { buildKhoraHostDiscovery } from "../ops/build-host-discovery";
import type { HostRouteDeps } from "./deps";

export type { KhoraHostDiscovery } from "@khoralabs/khora-contracts";

export function handleWellKnownKhora(deps: HostRouteDeps): Response {
  const populationCurrent = deps.ctx.adminStats.registeredPrincipalCount();
  const doc = buildKhoraHostDiscovery({
    hostSpec: deps.ctx.hostSpec,
    populationCurrent,
    searchEnabled: deps.ctx.search !== undefined,
    inboxEnabled: deps.ctx.host.inboxHub !== undefined,
  });
  return Response.json(doc, {
    headers: { "Content-Type": "application/json" },
  });
}
