import type { Database } from "bun:sqlite";
import { generateAgentIdentity } from "@khoralabs/khora-auth";

import { getIdentityKey } from "../env";
import { encryptIdentityPayload } from "./crypto";

export async function provisionOrgIdentity(): Promise<{
  did: string;
  identityEncrypted: Buffer;
}> {
  const identity = await generateAgentIdentity();
  const identityJson = JSON.stringify({ did: identity.did, encoded: identity.export() });
  const identityEncrypted = encryptIdentityPayload(identityJson, getIdentityKey());
  return { did: identity.did, identityEncrypted };
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
