import type { Database } from "bun:sqlite";
import { createHash, timingSafeEqual } from "node:crypto";
import type {
  AgentAuthRegistration,
  AgentAuthRegistrationStatus,
} from "@khoralabs/registry-accounts-contracts";
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

export function createAgentAuthRegistration(
  db: Database,
  params: { email: string; now?: number },
): { registration: AgentAuthRegistration; claimToken: string } {
  const now = params.now ?? Date.now();
  const email = normalizeEmail(params.email);
  const claimToken = generateClaimToken();
  const claimTokenHash = hashAgentAuthSecret(claimToken);
  const id = crypto.randomUUID();
  const expiresAtMs = now + AGENT_AUTH_TTL_MS;

  db.prepare(
    `INSERT INTO agent_auth_registrations (
       id, email, claim_token_hash, otp_hash, expires_at_ms, status, created_at_ms
     ) VALUES (?, ?, ?, NULL, ?, 'pending_claim', ?)`,
  ).run(id, email, claimTokenHash, expiresAtMs, now);

  const row = db
    .prepare(
      `SELECT id, email, claim_token_hash, otp_hash, expires_at_ms, status, created_at_ms
       FROM agent_auth_registrations WHERE id = ? LIMIT 1`,
    )
    .get(id) as AgentAuthRegistrationRow | null;
  if (row === null) {
    throw new Error("agent auth registration insert failed");
  }
  return { registration: mapRegistration(row), claimToken };
}

function generateOtp(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
  return String(n % 1_000_000).padStart(6, "0");
}

export function setAgentAuthOtpHash(db: Database, registrationId: string, otp: string): void {
  db.prepare(`UPDATE agent_auth_registrations SET otp_hash = ? WHERE id = ?`).run(
    hashAgentAuthSecret(otp),
    registrationId,
  );
}

export function createAgentAuthRegistrationWithOtp(
  db: Database,
  params: { email: string; now?: number },
): { registration: AgentAuthRegistration; claimToken: string; otp: string } {
  const { registration, claimToken } = createAgentAuthRegistration(db, params);
  const otp = generateOtp();
  setAgentAuthOtpHash(db, registration.id, otp);
  const updated = db
    .prepare(
      `SELECT id, email, claim_token_hash, otp_hash, expires_at_ms, status, created_at_ms
       FROM agent_auth_registrations WHERE id = ? LIMIT 1`,
    )
    .get(registration.id) as AgentAuthRegistrationRow;
  return { registration: mapRegistration(updated), claimToken, otp };
}

export function findAgentAuthByClaimToken(
  db: Database,
  claimToken: string,
): AgentAuthRegistration | null {
  const hash = hashAgentAuthSecret(claimToken);
  const row = db
    .prepare(
      `SELECT id, email, claim_token_hash, otp_hash, expires_at_ms, status, created_at_ms
       FROM agent_auth_registrations WHERE claim_token_hash = ? LIMIT 1`,
    )
    .get(hash) as AgentAuthRegistrationRow | null;
  return row === null ? null : mapRegistration(row);
}

export function findPendingAgentAuthByEmail(
  db: Database,
  email: string,
): AgentAuthRegistration | null {
  const normalized = normalizeEmail(email);
  const row = db
    .prepare(
      `SELECT id, email, claim_token_hash, otp_hash, expires_at_ms, status, created_at_ms
       FROM agent_auth_registrations
       WHERE email = ? AND status = 'pending_claim'
       ORDER BY created_at_ms DESC LIMIT 1`,
    )
    .get(normalized) as AgentAuthRegistrationRow | null;
  return row === null ? null : mapRegistration(row);
}

export function expireAgentAuthIfNeeded(
  db: Database,
  registration: AgentAuthRegistration,
  now?: number,
): AgentAuthRegistration {
  const t = now ?? Date.now();
  if (registration.status !== "pending_claim") return registration;
  if (registration.expiresAtMs > t) return registration;
  db.prepare(`UPDATE agent_auth_registrations SET status = 'expired' WHERE id = ?`).run(
    registration.id,
  );
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

export function consumeClaimToken(
  db: Database,
  registrationId: string,
  now?: number,
): AgentAuthRegistration | null {
  const _t = now ?? Date.now();
  db.prepare(
    `UPDATE agent_auth_registrations SET status = 'claimed' WHERE id = ? AND status = 'pending_claim'`,
  ).run(registrationId);
  const row = db
    .prepare(
      `SELECT id, email, claim_token_hash, otp_hash, expires_at_ms, status, created_at_ms
       FROM agent_auth_registrations WHERE id = ? LIMIT 1`,
    )
    .get(registrationId) as AgentAuthRegistrationRow | null;
  if (row === null || row.status !== "claimed") return null;
  return mapRegistration(row);
}

export { AGENT_AUTH_TTL_MS };
