import type { AdminTokenAuth } from "@khoralabs/khora-auth";

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

/** Require configured root-token Bearer auth for /v1/ops. */
export async function requireAdminToken(
  req: Request,
  adminTokenAuth: AdminTokenAuth | null,
): Promise<Response | null> {
  if (adminTokenAuth === null) {
    return Response.json({ error: "Admin token auth is not configured" }, { status: 503 });
  }
  const principal = await adminTokenAuth.authenticate(req);
  if (principal === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
