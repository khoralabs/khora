import type { Database } from "bun:sqlite";
import { generateAgentIdentity } from "@khoralabs/khora-auth";

import { getIdentityKey } from "../env";
import { encryptIdentityPayload } from "./crypto";

export type ExedraUser = {
  id: string;
  registryUserId: string;
  createdAtMs: number;
};

type UserRow = {
  id: string;
  registry_user_id: string;
  created_at_ms: number;
};

function mapUser(row: UserRow): ExedraUser {
  return {
    id: row.id,
    registryUserId: row.registry_user_id,
    createdAtMs: row.created_at_ms,
  };
}

export function findUserByRegistryId(db: Database, registryUserId: string): ExedraUser | null {
  const row = db
    .query<UserRow, [string]>(
      `SELECT id, registry_user_id, created_at_ms FROM users WHERE registry_user_id = ? LIMIT 1`,
    )
    .get(registryUserId);
  return row === null ? null : mapUser(row);
}

export function findUserById(db: Database, userId: string): ExedraUser | null {
  const row = db
    .query<UserRow, [string]>(
      `SELECT id, registry_user_id, created_at_ms FROM users WHERE id = ? LIMIT 1`,
    )
    .get(userId);
  return row === null ? null : mapUser(row);
}

/** Provision a custodial DID for a registry user on first sign-in / invite accept. */
export async function getOrCreateUser(db: Database, registryUserId: string): Promise<ExedraUser> {
  const existing = findUserByRegistryId(db, registryUserId);
  if (existing !== null) return existing;

  const identity = await generateAgentIdentity();
  const identityJson = JSON.stringify({ did: identity.did, encoded: identity.export() });
  const identityEncrypted = encryptIdentityPayload(identityJson, getIdentityKey());
  const now = Date.now();

  db.prepare(
    `INSERT INTO users (id, registry_user_id, identity_encrypted, created_at_ms)
     VALUES (?, ?, ?, ?)`,
  ).run(identity.did, registryUserId, identityEncrypted, now);

  return { id: identity.did, registryUserId, createdAtMs: now };
}
