import {
  activateKhoraHost,
  findPublicHostBySlug,
  InvalidHostHealthPathError,
  InvalidHostSlugError,
  InvalidKhoraHostBaseUrlError,
  listAllHosts,
  listPublicHosts,
  registerKhoraHost,
} from "@khoralabs/users";
import { getRegistryDatabase } from "@khoralabs/users-auth";
import { probeHostHealthById } from "../host-health";
import { hostToFullJson, hostToPublicJson } from "./host-json";
import { authorizeRegistryInternal } from "./registry-internal";

const REGISTER_LIMIT = 20;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;
const registerCounts = new Map<string, { count: number; resetAtMs: number }>();

function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip")?.trim() ??
    "unknown"
  );
}

function checkRegisterRateLimit(req: Request): boolean {
  const ip = clientIp(req);
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

type RegisterBody = {
  slug?: string;
  baseUrl?: string;
  displayName?: string;
  description?: string;
  capabilities?: Record<string, unknown>;
  healthReadyPath?: string;
  healthPath?: string;
};

export function handleHostsList(): Response {
  const db = getRegistryDatabase();
  const hosts = listPublicHosts(db).map(hostToPublicJson);
  return Response.json({ hosts });
}

export function handleHostGet(slug: string): Response {
  const db = getRegistryDatabase();
  const host = findPublicHostBySlug(db, slug);
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

  const db = getRegistryDatabase();
  try {
    const host = registerKhoraHost(db, {
      slug,
      baseUrl,
      ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.capabilities !== undefined ? { capabilities: body.capabilities } : {}),
      ...(body.healthReadyPath !== undefined ? { healthReadyPath: body.healthReadyPath } : {}),
      ...(body.healthPath !== undefined ? { healthPath: body.healthPath } : {}),
    });
    return Response.json(
      {
        host: hostToFullJson(host, db),
        message:
          "Host registered as pending. An operator must activate it before it appears in the public catalog.",
      },
      { status: 201 },
    );
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

export function handleInternalHostsList(req: Request): Response {
  if (!authorizeRegistryInternal(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getRegistryDatabase();
  const hosts = listAllHosts(db).map((host) => hostToFullJson(host, db));
  return Response.json({ hosts });
}

export async function handleInternalHostActivate(req: Request, hostId: string): Promise<Response> {
  if (!authorizeRegistryInternal(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = hostId.trim();
  if (id.length === 0) {
    return Response.json({ error: "host id required" }, { status: 400 });
  }
  const db = getRegistryDatabase();
  try {
    const { host, managementToken } = activateKhoraHost(db, id);
    const probed = await probeHostHealthById(db, host.id);
    return Response.json({
      host: hostToFullJson(probed ?? host, db),
      ...(managementToken !== null ? { managementToken } : {}),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "activate failed";
    const status = msg.includes("not found") ? 404 : 400;
    return Response.json({ error: msg }, { status });
  }
}
