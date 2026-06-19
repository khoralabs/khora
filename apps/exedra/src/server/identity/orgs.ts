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
