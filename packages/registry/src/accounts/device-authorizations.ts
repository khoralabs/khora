import { createHash } from "node:crypto";
import type { RegistryDatabase } from "@khoralabs/registry/persistence";
import type { DeviceAuthorization, DeviceAuthorizationStatus } from "./ceremony-types";
import type { DeviceAuthorizationRow } from "./types-internal";

const DEVICE_TTL_MS = 15 * 60 * 1000;

function mapDevice(row: DeviceAuthorizationRow): DeviceAuthorization {
  return {
    id: row.id,
    deviceCodeHash: row.device_code_hash,
    userCode: row.user_code,
    status: row.status as DeviceAuthorizationStatus,
    sessionToken: row.session_token,
    expiresAtMs: row.expires_at_ms,
    approvedAtMs: row.approved_at_ms,
    consumedAtMs: row.consumed_at_ms,
    sourceApp: row.source_app,
    createdAtMs: row.created_at_ms,
  };
}

export function hashDeviceCode(deviceCode: string): string {
  return createHash("sha256").update(deviceCode, "utf8").digest("hex");
}

function generateUserCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    const random = crypto.getRandomValues(new Uint8Array(1))[0];
    if (random === undefined) {
      throw new Error("failed to generate random value");
    }
    code += chars[random % chars.length];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export async function createDeviceAuthorization(
  db: RegistryDatabase,
  params?: { sourceApp?: string; now?: number },
): Promise<{ device: DeviceAuthorization; deviceCode: string }> {
  const now = params?.now ?? Date.now();
  const deviceCode = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  const deviceCodeHash = hashDeviceCode(deviceCode);
  const id = crypto.randomUUID();
  const userCode = generateUserCode().toUpperCase();
  const expiresAtMs = now + DEVICE_TTL_MS;

  await db.exec(
    `INSERT INTO device_authorizations (
       id, device_code_hash, user_code, status, expires_at_ms, source_app, created_at_ms
     ) VALUES (?, ?, ?, 'pending', ?, ?, ?)`,
    [id, deviceCodeHash, userCode, expiresAtMs, params?.sourceApp ?? null, now],
  );

  const row = await db.queryOne<DeviceAuthorizationRow>(
    `SELECT id, device_code_hash, user_code, status, session_token, expires_at_ms,
            approved_at_ms, consumed_at_ms, source_app, created_at_ms
     FROM device_authorizations WHERE id = ? LIMIT 1`,
    [id],
  );
  if (row === undefined) {
    throw new Error("device authorization insert failed");
  }
  return { device: mapDevice(row), deviceCode };
}

export async function findDeviceByCodeHash(
  db: RegistryDatabase,
  deviceCodeHash: string,
): Promise<DeviceAuthorization | null> {
  const row = await db.queryOne<DeviceAuthorizationRow>(
    `SELECT id, device_code_hash, user_code, status, session_token, expires_at_ms,
            approved_at_ms, consumed_at_ms, source_app, created_at_ms
     FROM device_authorizations WHERE device_code_hash = ? LIMIT 1`,
    [deviceCodeHash],
  );
  return row === undefined ? null : mapDevice(row);
}

export async function findPendingDeviceByUserCode(
  db: RegistryDatabase,
  userCode: string,
): Promise<DeviceAuthorization | null> {
  const normalized = userCode.trim().toUpperCase();
  const row = await db.queryOne<DeviceAuthorizationRow>(
    `SELECT id, device_code_hash, user_code, status, session_token, expires_at_ms,
            approved_at_ms, consumed_at_ms, source_app, created_at_ms
     FROM device_authorizations
     WHERE user_code = ? AND status = 'pending'
     ORDER BY created_at_ms DESC LIMIT 1`,
    [normalized],
  );
  return row === undefined ? null : mapDevice(row);
}

export async function expireDeviceIfNeeded(
  db: RegistryDatabase,
  device: DeviceAuthorization,
  now?: number,
): Promise<DeviceAuthorization> {
  const t = now ?? Date.now();
  if (device.status !== "pending" && device.status !== "approved") {
    return device;
  }
  if (device.expiresAtMs > t) {
    return device;
  }
  await db.exec(`UPDATE device_authorizations SET status = 'expired' WHERE id = ?`, [device.id]);
  return { ...device, status: "expired" };
}

export async function approveDeviceAuthorization(
  db: RegistryDatabase,
  params: { userCode: string; sessionToken: string; now?: number },
): Promise<DeviceAuthorization> {
  const now = params.now ?? Date.now();
  const device = await findPendingDeviceByUserCode(db, params.userCode);
  if (device === null) {
    throw new Error("device authorization not found");
  }
  const checked = await expireDeviceIfNeeded(db, device, now);
  if (checked.status === "expired") {
    throw new Error("device authorization expired");
  }
  await db.exec(
    `UPDATE device_authorizations
     SET status = 'approved', session_token = ?, approved_at_ms = ?
     WHERE id = ?`,
    [params.sessionToken, now, device.id],
  );
  const updated = await findDeviceByCodeHash(db, device.deviceCodeHash);
  if (updated === null) {
    throw new Error("device authorization approve failed");
  }
  return updated;
}

export async function consumeDeviceAuthorization(
  db: RegistryDatabase,
  deviceCode: string,
  now?: number,
): Promise<DeviceAuthorization | null> {
  const hash = hashDeviceCode(deviceCode);
  const device = await findDeviceByCodeHash(db, hash);
  if (device === null) return null;
  const t = now ?? Date.now();
  const checked = await expireDeviceIfNeeded(db, device, t);
  if (checked.status !== "approved" || checked.sessionToken === null) {
    return checked;
  }
  await db.exec(
    `UPDATE device_authorizations SET status = 'consumed', consumed_at_ms = ? WHERE id = ?`,
    [t, device.id],
  );
  return findDeviceByCodeHash(db, hash);
}

/** Format a raw session token as `cookieName=value`, or pass through if already `name=value`. */
export function deviceSessionCookie(sessionToken: string, cookieName: string): string {
  if (sessionToken.includes("=")) {
    return sessionToken;
  }
  return `${cookieName}=${sessionToken}`;
}
