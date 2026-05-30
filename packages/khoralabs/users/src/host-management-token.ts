import type { Database } from "bun:sqlite";
import { createHash, timingSafeEqual } from "node:crypto";

export function hashHostManagementToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateHostManagementToken(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
}

export function issueHostManagementToken(db: Database, hostId: string): string {
  const row = db.prepare(`SELECT id FROM khora_hosts WHERE id = ? LIMIT 1`).get(hostId) as {
    id: string;
  } | null;
  if (row === null) {
    throw new Error("host not found");
  }
  const managementToken = generateHostManagementToken();
  db.prepare(`UPDATE khora_hosts SET management_token_hash = ? WHERE id = ?`).run(
    hashHostManagementToken(managementToken),
    hostId,
  );
  return managementToken;
}

/** Returns host id when token matches the host slug. */
export function verifyHostManagementToken(
  db: Database,
  slug: string,
  token: string,
): string | null {
  const row = db
    .prepare(`SELECT id, management_token_hash FROM khora_hosts WHERE slug = ? LIMIT 1`)
    .get(slug.trim()) as { id: string; management_token_hash: string | null } | null;
  if (row === null || row.management_token_hash === null) {
    return null;
  }
  const hash = hashHostManagementToken(token);
  const a = Buffer.from(hash, "utf8");
  const b = Buffer.from(row.management_token_hash, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null;
  }
  return row.id;
}
