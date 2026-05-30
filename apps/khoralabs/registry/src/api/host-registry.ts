import {
  InvalidTrustedOriginError,
  OriginQuotaExceededError,
  readHostRegistryState,
  TrustedOriginConflictError,
  updateHostRegistrySettings,
  verifyHostManagementToken,
} from "@khoralabs/users";
import { getRegistryDatabase, reloadRegistryAuth } from "@khoralabs/users-auth";
import { readRegistryTrustedOrigins } from "../trusted-origins";
import { hostRegistryJson, hostToFullJson } from "./host-json";

function readBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization")?.trim() ?? "";
  const prefix = "Bearer ";
  if (!auth.startsWith(prefix)) {
    return null;
  }
  const token = auth.slice(prefix.length).trim();
  return token.length > 0 ? token : null;
}

function reloadAuthTrustedOrigins(): void {
  reloadRegistryAuth({
    resolveTrustedOrigins: () => readRegistryTrustedOrigins(getRegistryDatabase()),
  });
}

type HostRegistryPutBody = {
  participationEnabled?: boolean;
  origins?: string[];
};

export function handleHostRegistryGet(req: Request, slug: string): Response {
  const token = readBearerToken(req);
  if (token === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getRegistryDatabase();
  const host = verifyHostManagementToken(db, slug, token);
  if (host === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const state = readHostRegistryState(db, host.id);
  if (state === null) {
    return Response.json({ error: "Host not found" }, { status: 404 });
  }
  return Response.json({
    slug: host.slug,
    status: host.status,
    ...hostRegistryJson(host, state),
  });
}

export async function handleHostRegistryPut(req: Request, slug: string): Promise<Response> {
  const token = readBearerToken(req);
  if (token === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getRegistryDatabase();
  const host = verifyHostManagementToken(db, slug, token);
  if (host === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: HostRegistryPutBody;
  try {
    body = (await req.json()) as HostRegistryPutBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.participationEnabled === undefined && body.origins === undefined) {
    return Response.json({ error: "participationEnabled or origins required" }, { status: 400 });
  }

  try {
    const updated = updateHostRegistrySettings(db, host.id, {
      ...(body.participationEnabled !== undefined
        ? { registryParticipationEnabled: body.participationEnabled }
        : {}),
      ...(body.origins !== undefined ? { origins: body.origins } : {}),
    });
    reloadAuthTrustedOrigins();
    const state = readHostRegistryState(db, updated.id);
    if (state === null) {
      return Response.json({ error: "Host not found" }, { status: 404 });
    }
    return Response.json({
      slug: updated.slug,
      status: updated.status,
      ...hostRegistryJson(updated, state),
    });
  } catch (err: unknown) {
    if (
      err instanceof InvalidTrustedOriginError ||
      err instanceof OriginQuotaExceededError ||
      err instanceof TrustedOriginConflictError
    ) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    const msg = err instanceof Error ? err.message : "registry update failed";
    const status = msg.includes("not found") ? 404 : 400;
    return Response.json({ error: msg }, { status });
  }
}

export function hostRegistryFullJson(
  host: Parameters<typeof hostToFullJson>[0],
  db: ReturnType<typeof getRegistryDatabase>,
  managementToken: string | null,
): Record<string, unknown> {
  const state = readHostRegistryState(db, host.id);
  return {
    host: hostToFullJson(host, db),
    ...(managementToken !== null ? { managementToken } : {}),
    ...(state !== null ? hostRegistryJson(host, state) : {}),
  };
}
