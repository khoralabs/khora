import { withAdminTokenAuth } from "./admin-token-guard";
import type { HostRouteDeps } from "./deps";
import {
  adminStatsCellResponse,
  adminStatsInactiveMembersResponse,
  adminStatsPrincipalResponse,
  adminStatsSummaryResponse,
} from "./internal-admin-stats";
import { jsonError } from "./responses";

export async function handleAdminStatsSummary(
  req: Request,
  deps: HostRouteDeps,
): Promise<Response> {
  return withAdminTokenAuth(req, deps, () => adminStatsSummaryResponse(deps));
}

export async function handleAdminStatsPrincipal(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
): Promise<Response> {
  const did = url.searchParams.get("did")?.trim() ?? "";
  if (did.length === 0) {
    return jsonError("Missing did query parameter", 400);
  }
  return withAdminTokenAuth(req, deps, () => adminStatsPrincipalResponse(deps, did));
}

export async function handleAdminStatsCell(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
): Promise<Response> {
  const cellId = url.searchParams.get("cellId")?.trim() ?? "";
  if (cellId.length === 0) {
    return jsonError("Missing cellId query parameter", 400);
  }
  return withAdminTokenAuth(req, deps, () => adminStatsCellResponse(deps, cellId));
}

export async function handleAdminStatsInactiveMembers(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
): Promise<Response> {
  return withAdminTokenAuth(req, deps, () => adminStatsInactiveMembersResponse(deps, url));
}
