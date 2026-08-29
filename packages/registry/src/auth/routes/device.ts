import {
  approveDeviceAuthorization,
  consumeDeviceAuthorization,
  createDeviceAuthorization,
  deviceSessionCookie,
  expireDeviceIfNeeded,
  hashDeviceCode,
} from "@khoralabs/registry/accounts";
import type { RegistryDatabase } from "@khoralabs/registry/persistence";
import type { RegistryIdentityPort } from "../../host/ports/identity";

export type DeviceRouteDeps = {
  db: RegistryDatabase;
  identity: RegistryIdentityPort;
  publicUrl: () => string;
  deviceVerificationPath: string;
  defaultSourceApp: string;
};

export async function handleDeviceAuthorize(
  req: Request,
  deps: DeviceRouteDeps,
): Promise<Response> {
  let sourceApp: string | undefined;
  try {
    const body = (await req.json()) as { sourceApp?: unknown };
    if (typeof body.sourceApp === "string") sourceApp = body.sourceApp;
  } catch {
    /* optional body */
  }

  const { device, deviceCode } = await createDeviceAuthorization(deps.db, {
    sourceApp: sourceApp ?? deps.defaultSourceApp,
  });
  const base = deps.publicUrl();
  const verificationUrl = `${base}${deps.deviceVerificationPath}?user_code=${encodeURIComponent(device.userCode)}`;
  const expiresIn = Math.max(0, Math.floor((device.expiresAtMs - Date.now()) / 1000));

  return Response.json({
    user_code: device.userCode,
    device_code: deviceCode,
    verification_url: verificationUrl,
    expires_in: expiresIn,
  });
}

export async function handleDeviceApprove(req: Request, deps: DeviceRouteDeps): Promise<Response> {
  const session = await deps.identity.getSession(req);
  if (session === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let userCode = "";
  try {
    const body = (await req.json()) as { user_code?: unknown; userCode?: unknown };
    const raw =
      typeof body.user_code === "string"
        ? body.user_code
        : typeof body.userCode === "string"
          ? body.userCode
          : "";
    userCode = raw.trim();
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }
  if (userCode.length === 0) {
    return Response.json({ error: "user_code required" }, { status: 400 });
  }

  const sessionCookie = deps.identity.getSessionCookieHeader(req);
  if (sessionCookie === null) {
    return Response.json({ error: "Session cookie unavailable" }, { status: 500 });
  }

  try {
    const device = await approveDeviceAuthorization(deps.db, {
      userCode,
      sessionToken: sessionCookie,
    });
    return Response.json({ ok: true, user_code: device.userCode });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "approve failed";
    return Response.json({ error: msg }, { status: 400 });
  }
}

export async function handleDeviceToken(req: Request, deps: DeviceRouteDeps): Promise<Response> {
  let deviceCode = "";
  try {
    const body = (await req.json()) as { device_code?: unknown; deviceCode?: unknown };
    const raw =
      typeof body.device_code === "string"
        ? body.device_code
        : typeof body.deviceCode === "string"
          ? body.deviceCode
          : "";
    deviceCode = raw.trim();
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }
  if (deviceCode.length === 0) {
    return Response.json({ error: "device_code required" }, { status: 400 });
  }

  const hash = hashDeviceCode(deviceCode);
  const existing = await deps.db.queryOne<{
    id: string;
    device_code_hash: string;
    user_code: string;
    status: string;
    session_token: string | null;
    expires_at_ms: number;
    approved_at_ms: number | null;
    consumed_at_ms: number | null;
    source_app: string | null;
    created_at_ms: number;
  }>(
    `SELECT id, device_code_hash, user_code, status, session_token, expires_at_ms,
            approved_at_ms, consumed_at_ms, source_app, created_at_ms
     FROM device_authorizations WHERE device_code_hash = ? LIMIT 1`,
    [hash],
  );

  if (existing === undefined) {
    return Response.json({ error: "Unknown device" }, { status: 404 });
  }

  const device = {
    id: existing.id,
    deviceCodeHash: existing.device_code_hash,
    userCode: existing.user_code,
    status: existing.status as "pending" | "approved" | "consumed" | "expired",
    sessionToken: existing.session_token,
    expiresAtMs: existing.expires_at_ms,
    approvedAtMs: existing.approved_at_ms,
    consumedAtMs: existing.consumed_at_ms,
    sourceApp: existing.source_app,
    createdAtMs: existing.created_at_ms,
  };

  const checked = await expireDeviceIfNeeded(deps.db, device);
  if (checked.status === "expired") {
    return Response.json({ error: "expired", status: "expired" }, { status: 400 });
  }
  if (checked.status === "consumed") {
    return Response.json({ error: "already consumed", status: "consumed" }, { status: 400 });
  }
  if (checked.status === "pending") {
    return Response.json({ status: "authorization_pending" }, { status: 428 });
  }

  const consumed = await consumeDeviceAuthorization(deps.db, deviceCode);
  if (consumed === null || consumed.sessionToken === null) {
    return Response.json({ error: "token unavailable" }, { status: 500 });
  }

  return Response.json({
    status: "approved",
    session_cookie: deviceSessionCookie(consumed.sessionToken),
  });
}
