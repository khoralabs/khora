import type { AdminTokenAuth } from "@khoralabs/khora-auth";
import type { HostRouteDeps } from "./deps";
import { jsonError } from "./responses";

export async function withAdminTokenAuth(
  req: Request,
  deps: HostRouteDeps,
  handler: () => Response | Promise<Response>,
): Promise<Response> {
  if (deps.adminTokenAuth === null) {
    return jsonError("Admin token auth is not configured", 503);
  }
  const principal = await deps.adminTokenAuth.authenticate(req);
  if (principal === null) {
    return jsonError("Unauthorized", 401);
  }
  return handler();
}

export async function routeAdminTokenAuth(
  req: Request,
  url: URL,
  adminTokenAuth: AdminTokenAuth | null,
): Promise<Response | undefined> {
  if (adminTokenAuth?.route === undefined) return undefined;
  return adminTokenAuth.route(req, url);
}
