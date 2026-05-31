import type { Database } from "bun:sqlite";
import { createHash, timingSafeEqual } from "node:crypto";

export function hashHostRegistrationSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function generateHostRegistrationSecret(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
}

export function issueHostRegistrationSecret(db: Database, hostId: string): string {
  const row = db.prepare(`SELECT id FROM khora_hosts WHERE id = ? LIMIT 1`).get(hostId) as {
    id: string;
  } | null;
  if (row === null) {
    throw new Error("host not found");
  }
  const secret = generateHostRegistrationSecret();
  db.prepare(`UPDATE khora_hosts SET registration_secret_hash = ? WHERE id = ?`).run(
    hashHostRegistrationSecret(secret),
    hostId,
  );
  return secret;
}

/** Returns host id when secret matches the host slug. */
export function verifyHostRegistrationSecret(
  db: Database,
  slug: string,
  secret: string,
): string | null {
  const row = db
    .prepare(`SELECT id, registration_secret_hash FROM khora_hosts WHERE slug = ? LIMIT 1`)
    .get(slug.trim()) as { id: string; registration_secret_hash: string | null } | null;
  if (row === null || row.registration_secret_hash === null) {
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

export function clearHostRegistrationSecret(db: Database, hostId: string): void {
  db.prepare(`UPDATE khora_hosts SET registration_secret_hash = NULL WHERE id = ?`).run(hostId);
}

export function storePendingManagementToken(db: Database, hostId: string, token: string): void {
  db.prepare(`UPDATE khora_hosts SET pending_management_token = ? WHERE id = ?`).run(token, hostId);
}

export function takePendingManagementToken(db: Database, hostId: string): string | null {
  const row = db
    .prepare(`SELECT pending_management_token FROM khora_hosts WHERE id = ? LIMIT 1`)
    .get(hostId) as { pending_management_token: string | null } | null;
  if (row === null || row.pending_management_token === null) {
    return null;
  }
  db.prepare(`UPDATE khora_hosts SET pending_management_token = NULL WHERE id = ?`).run(hostId);
  return row.pending_management_token;
}
