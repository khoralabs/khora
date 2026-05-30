import {
  envHostSlug,
  envRegistryManagementToken,
  envRegistryParticipate,
  envRegistryUrl,
} from "../env";
import { fetchHostRegistryState, updateHostRegistryState } from "../registry-client";
import { withConsoleAuth } from "./console-guard";
import type { HostRouteDeps } from "./deps";
import { jsonError } from "./responses";

export async function handleAdminRegistryGet(req: Request, deps: HostRouteDeps): Promise<Response> {
  return withConsoleAuth(req, deps, async () => {
    if (!envRegistryParticipate()) {
      return Response.json({
        configured: false,
        message: "Set KHORA_REGISTRY_PARTICIPATE=1 to enable registry integration",
      });
    }
    const slug = envHostSlug();
    if (slug === undefined) {
      return jsonError("KHORA_HOST_SLUG is not configured", 400);
    }
    if (envRegistryManagementToken() === undefined) {
      return Response.json({
        configured: true,
        slug,
        registryUrl: envRegistryUrl() ?? "http://localhost:4000",
        status: "pending-token",
        message: "Activate this host in the registry admin and set KHORA_REGISTRY_MANAGEMENT_TOKEN",
      });
    }
    try {
      const state = await fetchHostRegistryState();
      return Response.json({ configured: true, ...state });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "registry read failed";
      return jsonError(msg, 502);
    }
  });
}

export async function handleAdminRegistryPut(req: Request, deps: HostRouteDeps): Promise<Response> {
  return withConsoleAuth(req, deps, async () => {
    if (!envRegistryParticipate()) {
      return jsonError("Registry participation is not enabled", 400);
    }
    if (envRegistryManagementToken() === undefined) {
      return jsonError("KHORA_REGISTRY_MANAGEMENT_TOKEN is not configured", 400);
    }

    let body: { participationEnabled?: boolean; origins?: string[] };
    try {
      body = (await req.json()) as { participationEnabled?: boolean; origins?: string[] };
    } catch {
      return jsonError("Invalid JSON body", 400);
    }

    if (body.participationEnabled === undefined && body.origins === undefined) {
      return jsonError("participationEnabled or origins required", 400);
    }

    try {
      const state = await updateHostRegistryState(body);
      return Response.json(state);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "registry update failed";
      return jsonError(msg, 502);
    }
  });
}
