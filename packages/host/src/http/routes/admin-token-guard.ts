import { KHORA_ERROR_CODE } from "@khoralabs/khora-contracts/http";
import type { HostRouteDeps } from "./deps";
import { jsonError } from "./responses";

export async function withAdminTokenAuth(
  req: Request,
  deps: HostRouteDeps,
  handler: () => Response | Promise<Response>,
): Promise<Response> {
  if (deps.adminTokenAuth === null) {
    return jsonError(
      "Admin token auth is not configured",
      503,
      KHORA_ERROR_CODE.admin_auth_not_configured,
    );
  }
  const principal = await deps.adminTokenAuth.authenticate(req);
  if (principal === null) {
    return jsonError("Unauthorized", 401, KHORA_ERROR_CODE.unauthorized);
  }
  return handler();
}
