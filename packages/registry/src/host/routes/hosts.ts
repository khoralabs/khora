import {
  findPublicHostBySlug,
  InvalidHostHealthPathError,
  InvalidHostSlugError,
  InvalidKhoraHostBaseUrlError,
  initializeRegistrationRequirements,
  listPublicHosts,
  readHostRegistrationPolicy,
  registerKhoraHost,
  registrationStatusJson,
  tryAutoActivateHost,
} from "@khoralabs/khora-registry/catalog";
import type { HostRegistrationWireState } from "@khoralabs/khora-registry/contracts";
import {
  assertSafeHostProbeTarget,
  UnsafeHostProbeTargetError,
} from "../../catalog/host-probe-target";
import { clientIpFromRequest } from "../client-ip";
import { probeHostHealth } from "../host-health";
import { registryHostRuntime } from "../runtime";
import { hostToFullJson, hostToPublicJson } from "./host-json";

const REGISTER_LIMIT = 20;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;
const registerCounts = new Map<string, { count: number; resetAtMs: number }>();

function checkRegisterRateLimit(req: Request): boolean {
  const ip = clientIpFromRequest(req);
  const now = Date.now();
  const entry = registerCounts.get(ip);
  if (entry === undefined || now >= entry.resetAtMs) {
    registerCounts.set(ip, { count: 1, resetAtMs: now + REGISTER_WINDOW_MS });
    return true;
  }
  if (entry.count >= REGISTER_LIMIT) {
    return false;
  }
  entry.count += 1;
  return true;
}

function envProbeTimeoutMs(): number {
  const raw = process.env.REGISTRY_HOST_HEALTH_PROBE_TIMEOUT_MS?.trim();
  const n = raw !== undefined ? Number.parseInt(raw, 10) : 5000;
  return Number.isFinite(n) && n > 0 ? n : 5000;
}

type RegisterBody = {
  slug?: string;
  baseUrl?: string;
  displayName?: string;
  description?: string;
  capabilities?: Record<string, unknown>;
  healthReadyPath?: string;
  healthPath?: string;
};

export async function handleHostsList(): Promise<Response> {
  const db = registryHostRuntime().db;
  const hosts = (await listPublicHosts(db)).map(hostToPublicJson);
  return Response.json({ hosts });
}

export async function handleHostGet(slug: string): Promise<Response> {
  const db = registryHostRuntime().db;
  const host = await findPublicHostBySlug(db, slug);
  if (host === null) {
    return Response.json({ error: "Host not found" }, { status: 404 });
  }
  return Response.json({ host: hostToPublicJson(host) });
}

export async function handleHostRegister(req: Request): Promise<Response> {
  if (!checkRegisterRateLimit(req)) {
    return Response.json({ error: "Too many registration attempts" }, { status: 429 });
  }

  let body: RegisterBody;
  try {
    body = (await req.json()) as RegisterBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const slug = body.slug?.trim() ?? "";
  const baseUrl = body.baseUrl?.trim() ?? "";
  if (slug.length === 0 || baseUrl.length === 0) {
    return Response.json({ error: "slug and baseUrl are required" }, { status: 400 });
  }

  try {
    const readyPath = body.healthReadyPath?.trim() || "/ready";
    const healthPath = body.healthPath?.trim() || "/health";
    const join = (path: string) => {
      const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
      return `${base}${path.startsWith("/") ? path : `/${path}`}`;
    };
    await assertSafeHostProbeTarget(join(readyPath));
    await assertSafeHostProbeTarget(join(healthPath));
  } catch (err: unknown) {
    if (err instanceof UnsafeHostProbeTargetError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  const db = registryHostRuntime().db;
  const policy = readHostRegistrationPolicy();
  try {
    const { host, registrationSecret } = await registerKhoraHost(db, {
      slug,
      baseUrl,
      registrationRequirements: initializeRegistrationRequirements(policy),
      ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.capabilities !== undefined ? { capabilities: body.capabilities } : {}),
      ...(body.healthReadyPath !== undefined ? { healthReadyPath: body.healthReadyPath } : {}),
      ...(body.healthPath !== undefined ? { healthPath: body.healthPath } : {}),
    });

    const timeoutMs = envProbeTimeoutMs();
    const activation = await tryAutoActivateHost(db, host.id, policy, async (registeredHost) =>
      probeHostHealth(registeredHost, { timeoutMs }),
    );

    const message =
      activation.host.status === "active"
        ? "Host registered and activated."
        : policy.trustLevel === "manual"
          ? "Host registered as pending. An operator must activate it before it appears in the public catalog."
          : "Host registered as pending. Complete registration requirements and claim activation.";

    const responseBody: HostRegistrationWireState = {
      ...registrationStatusJson(activation.host, policy),
      host: await hostToFullJson(activation.host, db),
      registrationSecret,
      activated: activation.activated,
      ...(activation.managementToken !== null
        ? { managementToken: activation.managementToken }
        : {}),
      message,
    };
    return Response.json(responseBody, { status: 201 });
  } catch (err: unknown) {
    if (
      err instanceof InvalidHostSlugError ||
      err instanceof InvalidKhoraHostBaseUrlError ||
      err instanceof InvalidHostHealthPathError
    ) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    const msg = err instanceof Error ? err.message : "registration failed";
    const status = msg.includes("already registered") ? 409 : 400;
    return Response.json({ error: msg }, { status });
  }
}
