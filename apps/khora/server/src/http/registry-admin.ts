import {
  claimHostRegistration,
  fetchHostRegistrationStatus,
  fetchHostRegistryState,
  registerHostWithRegistryRemote,
  updateHostRegistryState,
} from "../registry-client";
import { withConsoleAuth } from "./console-guard";
import type { HostRouteDeps } from "./deps";
import { jsonError } from "./responses";

export async function handleAdminRegistryGet(req: Request, deps: HostRouteDeps): Promise<Response> {
  return withConsoleAuth(req, deps, async () => {
    const hostSpec = deps.ctx.hostSpec;
    const config = hostSpec.readEffective();
    const base = {
      registryUrl: config.registryUrl,
      slug: config.slug,
      publicBaseUrl: config.publicBaseUrl,
      displayName: config.displayName,
      hasRegistrationSecret: config.registrationSecret !== undefined,
      hasManagementToken: config.managementToken !== undefined,
    };

    if (config.slug === undefined) {
      return Response.json({
        ...base,
        configured: false,
        message: "Configure host slug and registry URL to connect",
      });
    }

    if (config.registrationSecret !== undefined && config.managementToken === undefined) {
      try {
        const remote = await fetchHostRegistrationStatus(config);
        if (remote.managementToken !== undefined) {
          hostSpec.storeSecrets({ managementToken: remote.managementToken });
          hostSpec.clearRegistrationSecret();
        }
        if (remote.status === "active") {
          const activeConfig = hostSpec.readEffective();
          if (activeConfig.managementToken !== undefined) {
            const state = await fetchHostRegistryState(activeConfig);
            return Response.json({ configured: true, ...base, ...state, ...remote });
          }
        }
        return Response.json({ configured: true, ...base, ...remote });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "registration status read failed";
        return Response.json({ ...base, configured: true, status: "pending", error: msg });
      }
    }

    if (config.managementToken === undefined) {
      return Response.json({
        ...base,
        configured: true,
        status: "needs-registration",
        message:
          "Register this host with the registry (Save connection, then Register with registry)",
      });
    }

    try {
      const state = await fetchHostRegistryState(config);
      return Response.json({ configured: true, ...base, ...state });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "registry read failed";
      return jsonError(msg, 502);
    }
  });
}

export async function handleAdminRegistryConfigPut(
  req: Request,
  deps: HostRouteDeps,
): Promise<Response> {
  return withConsoleAuth(req, deps, async () => {
    let body: {
      registryUrl?: string;
      slug?: string;
      publicBaseUrl?: string;
      displayName?: string;
    };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return jsonError("Invalid JSON body", 400);
    }

    deps.ctx.hostSpec.patch({
      ...(body.registryUrl !== undefined ? { registryUrl: body.registryUrl.trim() } : {}),
      ...(body.slug !== undefined ? { slug: body.slug.trim() } : {}),
      ...(body.publicBaseUrl !== undefined ? { publicBaseUrl: body.publicBaseUrl.trim() } : {}),
      ...(body.displayName !== undefined ? { displayName: body.displayName.trim() } : {}),
    });
    const effective = deps.ctx.hostSpec.readEffective();

    return Response.json({
      configured: effective.slug !== undefined,
      registryUrl: effective.registryUrl,
      slug: effective.slug,
      publicBaseUrl: effective.publicBaseUrl,
      displayName: effective.displayName,
    });
  });
}

export async function handleAdminRegistryRegisterPost(
  req: Request,
  deps: HostRouteDeps,
): Promise<Response> {
  return withConsoleAuth(req, deps, async () => {
    const hostSpec = deps.ctx.hostSpec;
    const config = hostSpec.readEffective();
    if (config.slug === undefined) {
      return jsonError("Configure host slug before registering", 400);
    }

    try {
      const result = await registerHostWithRegistryRemote(config);
      if (result.registrationSecret !== undefined) {
        hostSpec.storeSecrets({ registrationSecret: result.registrationSecret });
      }
      if (result.managementToken !== undefined) {
        hostSpec.storeSecrets({ managementToken: result.managementToken });
        hostSpec.clearRegistrationSecret();
      }
      const effective = hostSpec.readEffective();
      const stored = hostSpec.read();
      return Response.json({
        configured: true,
        slug: config.slug,
        registryUrl: config.registryUrl,
        ...result,
        hasManagementToken: effective.managementToken !== undefined,
        hasRegistrationSecret: stored?.registrationSecret !== undefined,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "registration failed";
      return jsonError(msg, 502);
    }
  });
}

export async function handleAdminRegistryClaimPost(
  req: Request,
  deps: HostRouteDeps,
): Promise<Response> {
  return withConsoleAuth(req, deps, async () => {
    const hostSpec = deps.ctx.hostSpec;
    const config = hostSpec.readEffective();
    if (config.slug === undefined || config.registrationSecret === undefined) {
      return jsonError("Registration secret not available", 400);
    }

    try {
      const result = await claimHostRegistration(config);
      if (result.managementToken !== undefined) {
        hostSpec.storeSecrets({ managementToken: result.managementToken });
        hostSpec.clearRegistrationSecret();
      }
      const effective = hostSpec.readEffective();
      const stored = hostSpec.read();
      return Response.json({
        configured: true,
        slug: config.slug,
        ...result,
        hasManagementToken: effective.managementToken !== undefined,
        hasRegistrationSecret: stored?.registrationSecret !== undefined,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "claim failed";
      return jsonError(msg, 502);
    }
  });
}

export async function handleAdminRegistryPut(req: Request, deps: HostRouteDeps): Promise<Response> {
  return withConsoleAuth(req, deps, async () => {
    const config = deps.ctx.hostSpec.readEffective();
    if (config.managementToken === undefined) {
      return jsonError("Management token is not configured", 400);
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
      const state = await updateHostRegistryState(config, body);
      return Response.json(state);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "registry update failed";
      return jsonError(msg, 502);
    }
  });
}
