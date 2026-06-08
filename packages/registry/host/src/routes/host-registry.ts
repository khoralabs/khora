import {
  cancelHostTrustedOriginQuotaRequest,
  cancelHostTrustedOriginRequest,
  InvalidTrustedOriginError,
  OriginQuotaExceededError,
  readHostRegistryState,
  removeHostTrustedOrigin,
  requestHostTrustedOrigin,
  requestHostTrustedOriginQuota,
  TrustedOriginConflictError,
  verifyHostManagementToken,
} from "@khoralabs/registry-catalog";
import { registryHostRuntime } from "../runtime";
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

function registryStateResponse(
  host: NonNullable<ReturnType<typeof verifyHostManagementToken>>,
  db: import("bun:sqlite").Database,
): Response {
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

function mapOriginRequestError(err: unknown): { message: string; status: number } {
  if (
    err instanceof InvalidTrustedOriginError ||
    err instanceof OriginQuotaExceededError ||
    err instanceof TrustedOriginConflictError
  ) {
    return { message: err.message, status: 400 };
  }
  const msg = err instanceof Error ? err.message : "origin request failed";
  const status = msg.includes("not found") ? 404 : 400;
  return { message: msg, status };
}

export function handleHostRegistryGet(req: Request, slug: string): Response {
  const token = readBearerToken(req);
  if (token === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = registryHostRuntime().db;
  const host = verifyHostManagementToken(db, slug, token);
  if (host === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return registryStateResponse(host, db);
}

export async function handleHostRegistryOriginRequestPost(
  req: Request,
  slug: string,
): Promise<Response> {
  const token = readBearerToken(req);
  if (token === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = registryHostRuntime().db;
  const host = verifyHostManagementToken(db, slug, token);
  if (host === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { origin?: string };
  try {
    body = (await req.json()) as { origin?: string };
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const origin = body.origin?.trim() ?? "";
  if (origin.length === 0) {
    return Response.json({ error: "origin is required" }, { status: 400 });
  }

  try {
    const request = requestHostTrustedOrigin(db, host.id, origin);
    return Response.json({ ok: true, request }, { status: 201 });
  } catch (err: unknown) {
    const mapped = mapOriginRequestError(err);
    return Response.json({ error: mapped.message }, { status: mapped.status });
  }
}

export function handleHostRegistryOriginRequestDelete(
  req: Request,
  slug: string,
  requestId: string,
): Response {
  const token = readBearerToken(req);
  if (token === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = registryHostRuntime().db;
  const host = verifyHostManagementToken(db, slug, token);
  if (host === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    cancelHostTrustedOriginRequest(db, host.id, requestId.trim());
    return registryStateResponse(host, db);
  } catch (err: unknown) {
    const mapped = mapOriginRequestError(err);
    return Response.json({ error: mapped.message }, { status: mapped.status });
  }
}

export async function handleHostRegistryOriginDelete(
  req: Request,
  slug: string,
): Promise<Response> {
  const token = readBearerToken(req);
  if (token === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = registryHostRuntime().db;
  const host = verifyHostManagementToken(db, slug, token);
  if (host === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { origin?: string };
  try {
    body = (await req.json()) as { origin?: string };
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const origin = body.origin?.trim() ?? "";
  if (origin.length === 0) {
    return Response.json({ error: "origin is required" }, { status: 400 });
  }

  try {
    removeHostTrustedOrigin(db, host.id, origin);
    return registryStateResponse(host, db);
  } catch (err: unknown) {
    const mapped = mapOriginRequestError(err);
    return Response.json({ error: mapped.message }, { status: mapped.status });
  }
}

function mapQuotaRequestError(err: unknown): { message: string; status: number } {
  const msg = err instanceof Error ? err.message : "quota request failed";
  const status = msg.includes("not found") ? 404 : 400;
  return { message: msg, status };
}

export async function handleHostRegistryQuotaRequestPost(
  req: Request,
  slug: string,
): Promise<Response> {
  const token = readBearerToken(req);
  if (token === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = registryHostRuntime().db;
  const host = verifyHostManagementToken(db, slug, token);
  if (host === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { requestedIncluded?: number };
  try {
    body = (await req.json()) as { requestedIncluded?: number };
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (body.requestedIncluded === undefined || !Number.isFinite(body.requestedIncluded)) {
    return Response.json({ error: "requestedIncluded is required" }, { status: 400 });
  }

  try {
    const request = requestHostTrustedOriginQuota(db, host.id, body.requestedIncluded);
    return Response.json({ ok: true, request }, { status: 201 });
  } catch (err: unknown) {
    const mapped = mapQuotaRequestError(err);
    return Response.json({ error: mapped.message }, { status: mapped.status });
  }
}

export function handleHostRegistryQuotaRequestDelete(
  req: Request,
  slug: string,
  requestId: string,
): Response {
  const token = readBearerToken(req);
  if (token === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = registryHostRuntime().db;
  const host = verifyHostManagementToken(db, slug, token);
  if (host === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    cancelHostTrustedOriginQuotaRequest(db, host.id, requestId.trim());
    return registryStateResponse(host, db);
  } catch (err: unknown) {
    const mapped = mapQuotaRequestError(err);
    return Response.json({ error: mapped.message }, { status: mapped.status });
  }
}

export function hostRegistryFullJson(
  host: Parameters<typeof hostToFullJson>[0],
  db: import("bun:sqlite").Database,
  managementToken: string | null,
): Record<string, unknown> {
  const state = readHostRegistryState(db, host.id);
  return {
    host: hostToFullJson(host, db),
    ...(managementToken !== null ? { managementToken } : {}),
    ...(state !== null ? hostRegistryJson(host, state) : {}),
  };
}
