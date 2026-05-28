import type { HostRouteDeps } from "./deps.ts";
import { authorizeInternal } from "./internal-auth.ts";
import { jsonError } from "./responses.ts";

function requireInternalAuth(req: Request): Response | undefined {
  if (!authorizeInternal(req)) {
    return jsonError("Unauthorized", 401);
  }
  return undefined;
}

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

export function handleInternalAdminStatsSummary(req: Request, deps: HostRouteDeps): Response {
  const denied = requireInternalAuth(req);
  if (denied !== undefined) return denied;
  return adminStatsSummaryResponse(deps);
}

export function handleInternalAdminStatsCell(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
): Response {
  const denied = requireInternalAuth(req);
  if (denied !== undefined) return denied;

  const cellId = url.searchParams.get("cellId")?.trim() ?? "";
  if (cellId.length === 0) {
    return jsonError("Missing cellId query parameter", 400);
  }

  return adminStatsCellResponse(deps, cellId);
}

export function handleInternalAdminStatsPrincipal(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
): Response {
  const denied = requireInternalAuth(req);
  if (denied !== undefined) return denied;

  const did = url.searchParams.get("did")?.trim() ?? "";
  if (did.length === 0) {
    return jsonError("Missing did query parameter", 400);
  }

  return adminStatsPrincipalResponse(deps, did);
}

export function handleInternalAdminStatsInactiveMembers(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
): Response {
  const denied = requireInternalAuth(req);
  if (denied !== undefined) return denied;
  return adminStatsInactiveMembersResponse(deps, url);
}
