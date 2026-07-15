import {
  deliverPendingManagementToken,
  findHostBySlug,
  readHostRegistrationPolicy,
  registrationStatusJson,
  tryAutoActivateHost,
  verifyHostRegistrationSecret,
} from "@khoralabs/registry-catalog";
import type { HostRegistrationWireState } from "@khoralabs/registry-catalog-contracts";
import type { RegistryDatabase } from "@khoralabs/registry-persistence";
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

async function resolveHostForRegistrationSecret(
  db: RegistryDatabase,
  slug: string,
  secret: string,
) {
  const hostId = await verifyHostRegistrationSecret(db, slug, secret);
  if (hostId !== null) {
    return await findHostBySlug(db, slug);
  }
  const host = await findHostBySlug(db, slug);
  if (host !== null && host.status === "active") {
    return host;
  }
  return null;
}

async function registrationResponse(
  db: RegistryDatabase,
  host: NonNullable<Awaited<ReturnType<typeof findHostBySlug>>>,
  extras?: Pick<HostRegistrationWireState, "activated">,
): Promise<Response> {
  const policy = readHostRegistrationPolicy();
  const managementToken =
    host.status === "active" ? await deliverPendingManagementToken(db, host.id) : null;
  const body: HostRegistrationWireState = {
    ...registrationStatusJson(host, policy),
    host: await hostToFullJson(host, db),
    ...(managementToken !== null ? { managementToken } : {}),
    ...extras,
  };
  return Response.json(body);
}

export async function handleHostRegistrationGet(req: Request, slug: string): Promise<Response> {
  const secret = readBearerToken(req);
  if (secret === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = registryHostRuntime().db;
  const host = await resolveHostForRegistrationSecret(db, slug, secret);
  if (host === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return await registrationResponse(db, host);
}

export async function handleHostRegistrationClaim(req: Request, slug: string): Promise<Response> {
  const secret = readBearerToken(req);
  if (secret === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = registryHostRuntime().db;
  const hostId = await verifyHostRegistrationSecret(db, slug, secret);
  if (hostId === null) {
    const host = await findHostBySlug(db, slug);
    if (host !== null && host.status === "active") {
      return await registrationResponse(db, host, { activated: false });
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
    managementToken = await deliverPendingManagementToken(db, result.host.id);
  }

  const body: HostRegistrationWireState = {
    ...registrationStatusJson(result.host, policy),
    host: await hostToFullJson(result.host, db),
    activated: result.activated,
    ...(managementToken !== null ? { managementToken } : {}),
  };
  return Response.json(body);
}
