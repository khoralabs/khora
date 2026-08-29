import { createHash, timingSafeEqual } from "node:crypto";
import type { RegistryDatabase } from "@khoralabs/registry/persistence";
import type { AgentAuthRegistration, AgentAuthRegistrationStatus } from "./ceremony-types";
import { normalizeEmail } from "./normalize";
import type { AgentAuthRegistrationRow } from "./types-internal";

const AGENT_AUTH_TTL_MS = 15 * 60 * 1000;

function mapRegistration(row: AgentAuthRegistrationRow): AgentAuthRegistration {
  return {
    id: row.id,
    email: row.email,
    claimTokenHash: row.claim_token_hash,
    otpHash: row.otp_hash,
    expiresAtMs: row.expires_at_ms,
    status: row.status as AgentAuthRegistrationStatus,
    createdAtMs: row.created_at_ms,
  };
}

export function hashAgentAuthSecret(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function generateClaimToken(): string {
  return `clm_${Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url")}`;
}

export async function createAgentAuthRegistration(
  db: RegistryDatabase,
  params: { email: string; now?: number },
): Promise<{ registration: AgentAuthRegistration; claimToken: string }> {
  const now = params.now ?? Date.now();
  const email = normalizeEmail(params.email);
  const claimToken = generateClaimToken();
  const claimTokenHash = hashAgentAuthSecret(claimToken);
  const id = crypto.randomUUID();
  const expiresAtMs = now + AGENT_AUTH_TTL_MS;

  await db.exec(
    `INSERT INTO agent_auth_registrations (
       id, email, claim_token_hash, otp_hash, expires_at_ms, status, created_at_ms
     ) VALUES (?, ?, ?, NULL, ?, 'pending_claim', ?)`,
    [id, email, claimTokenHash, expiresAtMs, now],
  );

  const row = await db.queryOne<AgentAuthRegistrationRow>(
    `SELECT id, email, claim_token_hash, otp_hash, expires_at_ms, status, created_at_ms
     FROM agent_auth_registrations WHERE id = ? LIMIT 1`,
    [id],
  );
  if (row === undefined) {
    throw new Error("agent auth registration insert failed");
  }
  return { registration: mapRegistration(row), claimToken };
}

function generateOtp(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
  return String(n % 1_000_000).padStart(6, "0");
}

export async function setAgentAuthOtpHash(
  db: RegistryDatabase,
  registrationId: string,
  otp: string,
): Promise<void> {
  await db.exec(`UPDATE agent_auth_registrations SET otp_hash = ? WHERE id = ?`, [
    hashAgentAuthSecret(otp),
    registrationId,
  ]);
}

export async function createAgentAuthRegistrationWithOtp(
  db: RegistryDatabase,
  params: { email: string; now?: number },
): Promise<{ registration: AgentAuthRegistration; claimToken: string; otp: string }> {
  const { registration, claimToken } = await createAgentAuthRegistration(db, params);
  const otp = generateOtp();
  await setAgentAuthOtpHash(db, registration.id, otp);
  const updated = await db.queryOne<AgentAuthRegistrationRow>(
    `SELECT id, email, claim_token_hash, otp_hash, expires_at_ms, status, created_at_ms
     FROM agent_auth_registrations WHERE id = ? LIMIT 1`,
    [registration.id],
  );
  if (updated === undefined) {
    throw new Error("agent auth registration otp update failed");
  }
  return { registration: mapRegistration(updated), claimToken, otp };
}

export async function findAgentAuthByClaimToken(
  db: RegistryDatabase,
  claimToken: string,
): Promise<AgentAuthRegistration | null> {
  const hash = hashAgentAuthSecret(claimToken);
  const row = await db.queryOne<AgentAuthRegistrationRow>(
    `SELECT id, email, claim_token_hash, otp_hash, expires_at_ms, status, created_at_ms
     FROM agent_auth_registrations WHERE claim_token_hash = ? LIMIT 1`,
    [hash],
  );
  return row === undefined ? null : mapRegistration(row);
}

export async function findPendingAgentAuthByEmail(
  db: RegistryDatabase,
  email: string,
): Promise<AgentAuthRegistration | null> {
  const normalized = normalizeEmail(email);
  const row = await db.queryOne<AgentAuthRegistrationRow>(
    `SELECT id, email, claim_token_hash, otp_hash, expires_at_ms, status, created_at_ms
     FROM agent_auth_registrations
     WHERE email = ? AND status = 'pending_claim'
     ORDER BY created_at_ms DESC LIMIT 1`,
    [normalized],
  );
  return row === undefined ? null : mapRegistration(row);
}

export async function expireAgentAuthIfNeeded(
  db: RegistryDatabase,
  registration: AgentAuthRegistration,
  now?: number,
): Promise<AgentAuthRegistration> {
  const t = now ?? Date.now();
  if (registration.status !== "pending_claim") return registration;
  if (registration.expiresAtMs > t) return registration;
  await db.exec(`UPDATE agent_auth_registrations SET status = 'expired' WHERE id = ?`, [
    registration.id,
  ]);
  return { ...registration, status: "expired" };
}

export function verifyAgentAuthOtp(registration: AgentAuthRegistration, otp: string): boolean {
  if (registration.otpHash === null) return false;
  const hash = hashAgentAuthSecret(otp.trim());
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(registration.otpHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function consumeClaimToken(
  db: RegistryDatabase,
  registrationId: string,
  now?: number,
): Promise<AgentAuthRegistration | null> {
  const _t = now ?? Date.now();
  await db.exec(
    `UPDATE agent_auth_registrations SET status = 'claimed' WHERE id = ? AND status = 'pending_claim'`,
    [registrationId],
  );
  const row = await db.queryOne<AgentAuthRegistrationRow>(
    `SELECT id, email, claim_token_hash, otp_hash, expires_at_ms, status, created_at_ms
     FROM agent_auth_registrations WHERE id = ? LIMIT 1`,
    [registrationId],
  );
  if (row === undefined || row.status !== "claimed") return null;
  return mapRegistration(row);
}

export { AGENT_AUTH_TTL_MS };
