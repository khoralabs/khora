import type { AdminTokenAuth } from "@khoralabs/admin-token";

export async function withAdminTokenAuth(
  req: Request,
  adminTokenAuth: AdminTokenAuth | null,
  handler: () => Response | Promise<Response>,
): Promise<Response> {
  if (adminTokenAuth === null) {
    return Response.json({ error: "Admin token auth is not configured" }, { status: 503 });
  }
  const principal = await adminTokenAuth.authenticate(req);
  if (principal === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
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
