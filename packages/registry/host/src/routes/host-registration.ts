import {
  deliverPendingManagementToken,
  findHostBySlug,
  readHostRegistrationPolicy,
  registrationStatusJson,
  tryAutoActivateHost,
  verifyHostRegistrationSecret,
} from "@khoralabs/registry-catalog";
import { probeHostHealth } from "../host-health";
import { registryHostRuntime } from "../runtime";
import { hostToFullJson } from "./host-json";

function readBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization")?.trim() ?? "";
  const prefix = "Bearer ";
  if (!auth.startsWith(prefix)) {
    return null;
  }
  const token = auth.slice(prefix.length).trim();
  return token.length > 0 ? token : null;
}

function envProbeTimeoutMs(): number {
  const raw = process.env.REGISTRY_HOST_HEALTH_PROBE_TIMEOUT_MS?.trim();
  const n = raw !== undefined ? Number.parseInt(raw, 10) : 5000;
  return Number.isFinite(n) && n > 0 ? n : 5000;
}

function resolveHostForRegistrationSecret(
  db: import("bun:sqlite").Database,
  slug: string,
  secret: string,
) {
  const hostId = verifyHostRegistrationSecret(db, slug, secret);
  if (hostId !== null) {
    return findHostBySlug(db, slug);
  }
  const host = findHostBySlug(db, slug);
  if (host !== null && host.status === "active") {
    return host;
  }
  return null;
}

function registrationResponse(
  db: import("bun:sqlite").Database,
  host: NonNullable<ReturnType<typeof findHostBySlug>>,
  extras?: Record<string, unknown>,
): Response {
  const policy = readHostRegistrationPolicy();
  const managementToken =
    host.status === "active" ? deliverPendingManagementToken(db, host.id) : null;
  return Response.json({
    ...registrationStatusJson(host, policy),
    host: hostToFullJson(host, db),
    ...(managementToken !== null ? { managementToken } : {}),
    ...extras,
  });
}

export function handleHostRegistrationGet(req: Request, slug: string): Response {
  const secret = readBearerToken(req);
  if (secret === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = registryHostRuntime().db;
  const host = resolveHostForRegistrationSecret(db, slug, secret);
  if (host === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return registrationResponse(db, host);
}

export async function handleHostRegistrationClaim(req: Request, slug: string): Promise<Response> {
  const secret = readBearerToken(req);
  if (secret === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = registryHostRuntime().db;
  const hostId = verifyHostRegistrationSecret(db, slug, secret);
  if (hostId === null) {
    const host = findHostBySlug(db, slug);
    if (host !== null && host.status === "active") {
      return registrationResponse(db, host, { activated: false });
    }
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const policy = readHostRegistrationPolicy();
  const timeoutMs = envProbeTimeoutMs();
  const result = await tryAutoActivateHost(db, hostId, policy, async (host) =>
    probeHostHealth(host, { timeoutMs }),
  );

  let managementToken = result.managementToken;
  if (managementToken === null && result.host.status === "active") {
    managementToken = deliverPendingManagementToken(db, result.host.id);
  }

  return Response.json({
    ...registrationStatusJson(result.host, policy),
    host: hostToFullJson(result.host, db),
    activated: result.activated,
    ...(managementToken !== null ? { managementToken } : {}),
  });
}
