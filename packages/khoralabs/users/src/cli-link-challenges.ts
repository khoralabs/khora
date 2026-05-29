import type { Database } from "bun:sqlite";
import type { CliLinkChallenge } from "./types.ts";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

type ChallengeRow = {
  id: string;
  agent_did: string;
  nonce: string;
  expires_at_ms: number;
  consumed_at_ms: number | null;
  created_at_ms: number;
};

function mapChallenge(row: ChallengeRow): CliLinkChallenge {
  return {
    id: row.id,
    agentDid: row.agent_did,
    nonce: row.nonce,
    expiresAtMs: row.expires_at_ms,
    consumedAtMs: row.consumed_at_ms,
    createdAtMs: row.created_at_ms,
  };
}

export function createCliLinkChallenge(
  db: Database,
  agentDid: string,
  params?: { now?: number },
): CliLinkChallenge {
  const now = params?.now ?? Date.now();
  const id = crypto.randomUUID();
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url");
  const expiresAtMs = now + CHALLENGE_TTL_MS;
  db.prepare(
    `INSERT INTO cli_link_challenges (id, agent_did, nonce, expires_at_ms, created_at_ms)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, agentDid, nonce, expiresAtMs, now);
  const row = db
    .prepare(
      `SELECT id, agent_did, nonce, expires_at_ms, consumed_at_ms, created_at_ms
       FROM cli_link_challenges WHERE id = ? LIMIT 1`,
    )
    .get(id) as ChallengeRow | null;
  if (row === null) {
    throw new Error("cli link challenge insert failed");
  }
  return mapChallenge(row);
}

export function findCliLinkChallenge(db: Database, challengeId: string): CliLinkChallenge | null {
  const row = db
    .prepare(
      `SELECT id, agent_did, nonce, expires_at_ms, consumed_at_ms, created_at_ms
       FROM cli_link_challenges WHERE id = ? LIMIT 1`,
    )
    .get(challengeId) as ChallengeRow | null;
  return row === null ? null : mapChallenge(row);
}

export function consumeCliLinkChallenge(
  db: Database,
  params: { challengeId: string; agentDid: string; now?: number },
): CliLinkChallenge {
  const now = params.now ?? Date.now();
  const challenge = findCliLinkChallenge(db, params.challengeId);
  if (challenge === null) {
    throw new Error("challenge not found");
  }
  if (challenge.agentDid !== params.agentDid) {
    throw new Error("challenge did mismatch");
  }
  if (challenge.consumedAtMs !== null) {
    throw new Error("challenge already consumed");
  }
  if (challenge.expiresAtMs < now) {
    throw new Error("challenge expired");
  }
  db.prepare(`UPDATE cli_link_challenges SET consumed_at_ms = ? WHERE id = ?`).run(
    now,
    challenge.id,
  );
  const updated = findCliLinkChallenge(db, challenge.id);
  if (updated === null) {
    throw new Error("challenge consume failed");
  }
  return updated;
}
