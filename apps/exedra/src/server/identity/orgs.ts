import type { Database } from "bun:sqlite";
import { generateAgentIdentity } from "@khoralabs/khora-auth";

import { getOrg } from "../db/membership";
import { getIdentityKey } from "../env";
import { encryptIdentityPayload } from "./crypto";

/** Provision a custodial DID for an organization on first use (lazy or at create). */
export async function getOrCreateOrgIdentity(
  db: Database,
  orgId: string,
): Promise<{ did: string }> {
  const org = getOrg(db, orgId);
  if (org === null) {
    throw new Error(`Organization not found: ${orgId}`);
  }
  if (org.did !== null) {
    return { did: org.did };
  }

  const identity = await generateAgentIdentity();
  const identityJson = JSON.stringify({ did: identity.did, encoded: identity.export() });
  const identityEncrypted = encryptIdentityPayload(identityJson, getIdentityKey());

  db.prepare(`UPDATE orgs SET did = ?, identity_encrypted = ? WHERE id = ?`).run(
    identity.did,
    identityEncrypted,
    orgId,
  );

  return { did: identity.did };
}

export function getOrgIdentityEncrypted(db: Database, orgId: string): Buffer | null {
  const row = db
    .query<{ identity_encrypted: Buffer | null }, [string]>(
      `SELECT identity_encrypted FROM orgs WHERE id = ? LIMIT 1`,
    )
    .get(orgId);
  return row?.identity_encrypted ?? null;
}

export function setOrgNetworkOptedIn(db: Database, orgId: string): number {
  const now = Date.now();
  db.prepare(`UPDATE orgs SET network_opted_in_at_ms = ? WHERE id = ?`).run(now, orgId);
  return now;
}
