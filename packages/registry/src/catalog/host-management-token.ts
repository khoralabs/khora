import { createHash, timingSafeEqual } from "node:crypto";
import type { RegistryDatabase } from "@khoralabs/khora-registry/persistence";

export function hashHostManagementToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateHostManagementToken(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
}

export async function issueHostManagementToken(
  db: RegistryDatabase,
  hostId: string,
): Promise<string> {
  const row = await db.queryOne<{ id: string }>(`SELECT id FROM khora_hosts WHERE id = ? LIMIT 1`, [
    hostId,
  ]);
  if (row === undefined) {
    throw new Error("host not found");
  }
  const managementToken = generateHostManagementToken();
  await db.exec(`UPDATE khora_hosts SET management_token_hash = ? WHERE id = ?`, [
    hashHostManagementToken(managementToken),
    hostId,
  ]);
  return managementToken;
}

/** Returns host id when token matches the host slug. */
export async function verifyHostManagementToken(
  db: RegistryDatabase,
  slug: string,
  token: string,
): Promise<string | null> {
  const row = await db.queryOne<{ id: string; management_token_hash: string | null }>(
    `SELECT id, management_token_hash FROM khora_hosts WHERE slug = ? LIMIT 1`,
    [slug.trim()],
  );
  if (row === undefined || row.management_token_hash === null) {
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
