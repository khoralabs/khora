import { createHash, timingSafeEqual } from "node:crypto";
import type { RegistryDatabase } from "@khoralabs/registry/persistence";

export function hashHostRegistrationSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function generateHostRegistrationSecret(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
}

export async function issueHostRegistrationSecret(
  db: RegistryDatabase,
  hostId: string,
): Promise<string> {
  const row = await db.queryOne<{ id: string }>(`SELECT id FROM khora_hosts WHERE id = ? LIMIT 1`, [
    hostId,
  ]);
  if (row === undefined) {
    throw new Error("host not found");
  }
  const secret = generateHostRegistrationSecret();
  await db.exec(`UPDATE khora_hosts SET registration_secret_hash = ? WHERE id = ?`, [
    hashHostRegistrationSecret(secret),
    hostId,
  ]);
  return secret;
}

/** Returns host id when secret matches the host slug. */
export async function verifyHostRegistrationSecret(
  db: RegistryDatabase,
  slug: string,
  secret: string,
): Promise<string | null> {
  const row = await db.queryOne<{ id: string; registration_secret_hash: string | null }>(
    `SELECT id, registration_secret_hash FROM khora_hosts WHERE slug = ? LIMIT 1`,
    [slug.trim()],
  );
  if (row === undefined || row.registration_secret_hash === null) {
    return null;
  }
  const hash = hashHostRegistrationSecret(secret);
  const a = Buffer.from(hash, "utf8");
  const b = Buffer.from(row.registration_secret_hash, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null;
  }
  return row.id;
}

export async function clearHostRegistrationSecret(
  db: RegistryDatabase,
  hostId: string,
): Promise<void> {
  await db.exec(`UPDATE khora_hosts SET registration_secret_hash = NULL WHERE id = ?`, [hostId]);
}

export async function storePendingManagementToken(
  db: RegistryDatabase,
  hostId: string,
  token: string,
): Promise<void> {
  await db.exec(`UPDATE khora_hosts SET pending_management_token = ? WHERE id = ?`, [
    token,
    hostId,
  ]);
}

export async function takePendingManagementToken(
  db: RegistryDatabase,
  hostId: string,
): Promise<string | null> {
  const row = await db.queryOne<{ pending_management_token: string | null }>(
    `SELECT pending_management_token FROM khora_hosts WHERE id = ? LIMIT 1`,
    [hostId],
  );
  if (row === undefined || row.pending_management_token === null) {
    return null;
  }
  await db.exec(
    `UPDATE khora_hosts SET pending_management_token = NULL, registration_secret_hash = NULL WHERE id = ?`,
    [hostId],
  );
  return row.pending_management_token;
}
