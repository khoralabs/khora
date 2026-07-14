import type { AdminTokenAuth } from "@khoralabs/admin-token";
import { getRegistryAdminSummary } from "@khoralabs/registry-catalog";
import { registryHostRuntime } from "../../runtime";
import { withAdminTokenAuth } from "./admin-token-guard";

export function handleAdminStatsSummary(
  req: Request,
  adminTokenAuth: AdminTokenAuth | null,
): Promise<Response> {
  return withAdminTokenAuth(req, adminTokenAuth, async () =>
    Response.json(await getRegistryAdminSummary(registryHostRuntime().db)),
  );
}

export async function adminStatsSummaryResponse(): Promise<Response> {
  return Response.json(await getRegistryAdminSummary(registryHostRuntime().db));
}
