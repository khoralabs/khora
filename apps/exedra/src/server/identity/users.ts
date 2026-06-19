import type { Database } from "bun:sqlite";
import { generateAgentIdentity } from "@khoralabs/khora-auth";

import { getIdentityKey } from "../env";
import { encryptIdentityPayload } from "./crypto";

export type ExedraUser = {
  id: string;
  registryUserId: string;
  email: string | null;
  fullName: string | null;
  jobFunction: string | null;
  avatarS3Key: string | null;
  createdAtMs: number;
  termsAcceptedAtMs: number | null;
  networkOptedInAtMs: number | null;
};

type UserRow = {
  id: string;
  registry_user_id: string;
  email: string | null;
  full_name: string | null;
  job_function: string | null;
  avatar_s3_key: string | null;
  created_at_ms: number;
  terms_accepted_at_ms: number | null;
  network_opted_in_at_ms: number | null;
};

function mapUser(row: UserRow): ExedraUser {
  return {
    id: row.id,
    registryUserId: row.registry_user_id,
    email: row.email,
    fullName: row.full_name,
    jobFunction: row.job_function,
    avatarS3Key: row.avatar_s3_key,
    createdAtMs: row.created_at_ms,
    termsAcceptedAtMs: row.terms_accepted_at_ms,
    networkOptedInAtMs: row.network_opted_in_at_ms,
  };
}

const USER_SELECT = `SELECT id, registry_user_id, email, full_name, job_function, avatar_s3_key, created_at_ms, terms_accepted_at_ms, network_opted_in_at_ms FROM users`;

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

export function getUserIdentityEncrypted(db: Database, userId: string): Buffer | null {
  const row = db
    .query<{ identity_encrypted: Buffer | null }, [string]>(
      `SELECT identity_encrypted FROM users WHERE id = ? LIMIT 1`,
    )
    .get(userId);
  return row?.identity_encrypted ?? null;
}

export function acceptUserTerms(db: Database, userId: string): number {
  const now = Date.now();
  db.prepare(`UPDATE users SET terms_accepted_at_ms = ? WHERE id = ?`).run(now, userId);
  return now;
}

export function setUserNetworkOptedIn(db: Database, userId: string): number {
  const now = Date.now();
  db.prepare(`UPDATE users SET network_opted_in_at_ms = ? WHERE id = ?`).run(now, userId);
  return now;
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
export async function getOrCreateUser(
  db: Database,
  registryUserId: string,
  email: string | null = null,
): Promise<ExedraUser> {
  const existing = findUserByRegistryId(db, registryUserId);
  if (existing !== null) {
    if (email !== null && email !== existing.email) {
      db.prepare(`UPDATE users SET email = ? WHERE id = ?`).run(email, existing.id);
      return { ...existing, email };
    }
    return existing;
  }

  const identity = await generateAgentIdentity();
  const identityJson = JSON.stringify({ did: identity.did, encoded: identity.export() });
  const identityEncrypted = encryptIdentityPayload(identityJson, getIdentityKey());
  const now = Date.now();

  db.prepare(
    `INSERT INTO users (id, registry_user_id, email, identity_encrypted, created_at_ms)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(identity.did, registryUserId, email, identityEncrypted, now);

  return {
    id: identity.did,
    registryUserId,
    email,
    fullName: null,
    jobFunction: null,
    avatarS3Key: null,
    createdAtMs: now,
    termsAcceptedAtMs: null,
    networkOptedInAtMs: null,
  };
}

export async function getOrCreateUserForAuth(
  db: Database,
  _req: Request,
  session: { user: { id: string; email?: string | null } },
): Promise<ExedraUser> {
  return getOrCreateUser(db, session.user.id, session.user.email ?? null);
}
