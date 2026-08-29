import type { HostRouteDeps } from "./deps";
import { jsonError } from "./responses";

export function adminStatsSummaryResponse(deps: HostRouteDeps): Response {
  return Response.json(deps.ctx.adminStats.summary());
}

export function adminStatsCellResponse(deps: HostRouteDeps, cellId: string): Response {
  const result = deps.ctx.adminStats.cellDetail(cellId);
  if ("error" in result && result.error === "invalid_cell") {
    return jsonError("Invalid cellId", 400);
  }
  return Response.json(result);
}

export function adminStatsPrincipalResponse(deps: HostRouteDeps, did: string): Response {
  const result = deps.ctx.adminStats.principalDetail(did);
  if ("error" in result && result.error === "not_registered") {
    return jsonError("Principal not registered", 404);
  }
  return Response.json(result);
}

function parseInactiveDays(url: URL): number | undefined {
  const raw = url.searchParams.get("days")?.trim();
  if (raw === undefined || raw.length === 0) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

export function adminStatsInactiveMembersResponse(deps: HostRouteDeps, url: URL): Response {
  return Response.json(
    deps.ctx.adminStats.inactiveMembers({ inactiveDays: parseInactiveDays(url) }),
  );
}
