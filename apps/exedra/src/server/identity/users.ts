import type { Database } from "bun:sqlite";
import { generateAgentIdentity } from "@khoralabs/khora-auth";

import { getIdentityKey } from "../env";
import { encryptIdentityPayload } from "./crypto";

export type ExedraUser = {
  id: string;
  registryUserId: string;
  fullName: string | null;
  jobFunction: string | null;
  avatarS3Key: string | null;
  createdAtMs: number;
};

type UserRow = {
  id: string;
  registry_user_id: string;
  full_name: string | null;
  job_function: string | null;
  avatar_s3_key: string | null;
  created_at_ms: number;
};

function mapUser(row: UserRow): ExedraUser {
  return {
    id: row.id,
    registryUserId: row.registry_user_id,
    fullName: row.full_name,
    jobFunction: row.job_function,
    avatarS3Key: row.avatar_s3_key,
    createdAtMs: row.created_at_ms,
  };
}

const USER_SELECT = `SELECT id, registry_user_id, full_name, job_function, avatar_s3_key, created_at_ms FROM users`;

export function findUserByRegistryId(db: Database, registryUserId: string): ExedraUser | null {
  const row = db
    .query<UserRow, [string]>(`${USER_SELECT} WHERE registry_user_id = ? LIMIT 1`)
    .get(registryUserId);
  return row === null ? null : mapUser(row);
}

export function findUserById(db: Database, userId: string): ExedraUser | null {
  const row = db.query<UserRow, [string]>(`${USER_SELECT} WHERE id = ? LIMIT 1`).get(userId);
  return row === null ? null : mapUser(row);
}

function normalizeOptionalText(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function updateUserProfile(
  db: Database,
  userId: string,
  profile: { fullName?: string; jobFunction?: string },
): ExedraUser | null {
  const fullName =
    profile.fullName !== undefined ? normalizeOptionalText(profile.fullName) : undefined;
  const jobFunction =
    profile.jobFunction !== undefined ? normalizeOptionalText(profile.jobFunction) : undefined;

  if (fullName === undefined && jobFunction === undefined) {
    return findUserById(db, userId);
  }

  const sets: string[] = [];
  const values: (string | null)[] = [];
  if (fullName !== undefined) {
    sets.push("full_name = ?");
    values.push(fullName);
  }
  if (jobFunction !== undefined) {
    sets.push("job_function = ?");
    values.push(jobFunction);
  }

  db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).run(...values, userId);
  return findUserById(db, userId);
}

export function updateUserAvatarS3Key(
  db: Database,
  userId: string,
  avatarS3Key: string | null,
): ExedraUser | null {
  db.prepare(`UPDATE users SET avatar_s3_key = ? WHERE id = ?`).run(avatarS3Key, userId);
  return findUserById(db, userId);
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

  return {
    id: identity.did,
    registryUserId,
    fullName: null,
    jobFunction: null,
    avatarS3Key: null,
    createdAtMs: now,
  };
}
