import type { CliLinkChallenge } from "@khoralabs/registry/contracts";
import type { RegistryDatabase } from "@khoralabs/registry/persistence";
import type { CliLinkChallengeRow } from "./types-internal";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function mapChallenge(row: CliLinkChallengeRow): CliLinkChallenge {
  return {
    id: row.id,
    agentDid: row.agent_did,
    nonce: row.nonce,
    expiresAtMs: row.expires_at_ms,
    consumedAtMs: row.consumed_at_ms,
    createdAtMs: row.created_at_ms,
  };
}

export async function createCliLinkChallenge(
  db: RegistryDatabase,
  agentDid: string,
  params?: { now?: number },
): Promise<CliLinkChallenge> {
  const now = params?.now ?? Date.now();
  const id = crypto.randomUUID();
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url");
  const expiresAtMs = now + CHALLENGE_TTL_MS;
  await db.exec(
    `INSERT INTO cli_link_challenges (id, agent_did, nonce, expires_at_ms, created_at_ms)
     VALUES (?, ?, ?, ?, ?)`,
    [id, agentDid, nonce, expiresAtMs, now],
  );
  const row = await db.queryOne<CliLinkChallengeRow>(
    `SELECT id, agent_did, nonce, expires_at_ms, consumed_at_ms, created_at_ms
     FROM cli_link_challenges WHERE id = ? LIMIT 1`,
    [id],
  );
  if (row === undefined) {
    throw new Error("cli link challenge insert failed");
  }
  return mapChallenge(row);
}

export async function findCliLinkChallenge(
  db: RegistryDatabase,
  challengeId: string,
): Promise<CliLinkChallenge | null> {
  const row = await db.queryOne<CliLinkChallengeRow>(
    `SELECT id, agent_did, nonce, expires_at_ms, consumed_at_ms, created_at_ms
     FROM cli_link_challenges WHERE id = ? LIMIT 1`,
    [challengeId],
  );
  return row === undefined ? null : mapChallenge(row);
}

export async function consumeCliLinkChallenge(
  db: RegistryDatabase,
  params: { challengeId: string; agentDid: string; now?: number },
): Promise<CliLinkChallenge> {
  const now = params.now ?? Date.now();
  const challenge = await findCliLinkChallenge(db, params.challengeId);
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
  await db.exec(`UPDATE cli_link_challenges SET consumed_at_ms = ? WHERE id = ?`, [
    now,
    challenge.id,
  ]);
  const updated = await findCliLinkChallenge(db, challenge.id);
  if (updated === null) {
    throw new Error("challenge consume failed");
  }
  return updated;
}
