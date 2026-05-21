import type { HostRouteDeps } from "./deps.ts";
import { withConsoleAuth } from "./console-guard.ts";
import {
  adminStatsCellResponse,
  adminStatsPrincipalResponse,
  adminStatsSummaryResponse,
} from "./internal-admin-stats.ts";
import { jsonError } from "./responses.ts";

export async function handleAdminStatsSummary(req: Request, deps: HostRouteDeps): Promise<Response> {
  return withConsoleAuth(req, deps, () => adminStatsSummaryResponse(deps));
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
  return withConsoleAuth(req, deps, () => adminStatsPrincipalResponse(deps, did));
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
  return withConsoleAuth(req, deps, () => adminStatsCellResponse(deps, cellId));
}
