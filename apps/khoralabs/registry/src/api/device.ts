import {
  approveDeviceAuthorization,
  consumeDeviceAuthorization,
  createDeviceAuthorization,
  deviceSessionCookie,
  expireDeviceIfNeeded,
  hashDeviceCode,
} from "@khoralabs/users";
import {
  getRegistryDatabase,
  getRegistrySession,
  getRegistrySessionToken,
} from "@khoralabs/users-auth";
import { registryPublicUrl } from "./resolve-host.ts";

export async function handleDeviceAuthorize(req: Request): Promise<Response> {
  let sourceApp: string | undefined;
  try {
    const body = (await req.json()) as { sourceApp?: unknown };
    if (typeof body.sourceApp === "string") sourceApp = body.sourceApp;
  } catch {
    /* optional body */
  }

  const db = getRegistryDatabase();
  const { device, deviceCode } = createDeviceAuthorization(db, {
    sourceApp: sourceApp ?? "khora-cli",
  });
  const base = registryPublicUrl();
  const verificationUrl = `${base}/cli/link?user_code=${encodeURIComponent(device.userCode)}`;
  const expiresIn = Math.max(0, Math.floor((device.expiresAtMs - Date.now()) / 1000));

  return Response.json({
    user_code: device.userCode,
    device_code: deviceCode,
    verification_url: verificationUrl,
    expires_in: expiresIn,
  });
}

export async function handleDeviceApprove(req: Request): Promise<Response> {
  const session = await getRegistrySession(req);
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

  const token = await getRegistrySessionToken(req);
  if (token === null) {
    return Response.json({ error: "Session token unavailable" }, { status: 500 });
  }

  const db = getRegistryDatabase();
  try {
    const device = approveDeviceAuthorization(db, { userCode, sessionToken: token });
    return Response.json({ ok: true, user_code: device.userCode });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "approve failed";
    return Response.json({ error: msg }, { status: 400 });
  }
}

export async function handleDeviceToken(req: Request): Promise<Response> {
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

  const db = getRegistryDatabase();
  const hash = hashDeviceCode(deviceCode);
  const existing = db
    .prepare(
      `SELECT id, device_code_hash, user_code, status, session_token, expires_at_ms,
              approved_at_ms, consumed_at_ms, source_app, created_at_ms
       FROM device_authorizations WHERE device_code_hash = ? LIMIT 1`,
    )
    .get(hash) as {
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
  } | null;

  if (existing === null) {
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

  const checked = expireDeviceIfNeeded(db, device);
  if (checked.status === "expired") {
    return Response.json({ error: "expired", status: "expired" }, { status: 400 });
  }
  if (checked.status === "consumed") {
    return Response.json({ error: "already consumed", status: "consumed" }, { status: 400 });
  }
  if (checked.status === "pending") {
    return Response.json({ status: "authorization_pending" }, { status: 428 });
  }

  const consumed = consumeDeviceAuthorization(db, deviceCode);
  if (consumed === null || consumed.sessionToken === null) {
    return Response.json({ error: "token unavailable" }, { status: 500 });
  }

  return Response.json({
    status: "approved",
    session_cookie: deviceSessionCookie(consumed.sessionToken),
  });
}
