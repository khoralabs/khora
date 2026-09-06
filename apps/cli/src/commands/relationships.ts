import type { FlagMap } from "@khoralabs/cli-kit";
import { boolFlag, strFlag } from "@khoralabs/cli-kit";
import type { KhoraClient } from "@khoralabs/khora-client";
import type { KhoraRelationship } from "@khoralabs/khora-contracts";

import { withKhoraClient } from "../flows/context";
import { exitOnClientError } from "../lib/client-error";

export function formatRelationshipRow(r: KhoraRelationship): string {
  return `${r.channelId}  ${r.status}  ${r.role}  ${r.peerDid}`;
}

/** Resolve `--peer` DID or username to a principal DID. */
export async function resolvePeerDid(client: KhoraClient, peer: string): Promise<string> {
  const trimmed = peer.trim();
  if (trimmed.length === 0) {
    throw new Error("Usage: khora relationships invite --peer=<did|username> [--json]");
  }
  if (trimmed.startsWith("did:")) {
    return trimmed;
  }
  const result = await client.lookupProfileByUsername(trimmed);
  if (result === null) {
    throw new Error(`No profile found for username: ${trimmed}`);
  }
  const did = result.did?.trim();
  if (did === undefined || did.length === 0) {
    throw new Error(
      `Username "${trimmed}" resolved but host did not return a DID. Pass --peer=did:… instead.`,
    );
  }
  return did;
}

function channelIdFromPositional(positional: string[], verb: string): string {
  const id = positional[2]?.trim();
  if (id === undefined || id.length === 0) {
    throw new Error(`Usage: khora relationships ${verb} <channelId> [--json]`);
  }
  return id;
}

export async function handleRelationshipsList(flags: FlagMap): Promise<void> {
  const json = boolFlag(flags, "json");
  try {
    await withKhoraClient(flags, async (client) => {
      const snap = await client.listRelationships();
      if (json) {
        console.log(JSON.stringify(snap, null, 2));
        return;
      }
      console.log(`Relationships (${snap.relationships.length}):`);
      for (const r of snap.relationships) {
        console.log(`  ${formatRelationshipRow(r)}`);
      }
    });
  } catch (e) {
    exitOnClientError(e, flags);
  }
}

export async function handleRelationshipsInvite(flags: FlagMap): Promise<void> {
  const json = boolFlag(flags, "json");
  const peer = strFlag(flags, "peer")?.trim();
  if (peer === undefined || peer.length === 0) {
    throw new Error("Usage: khora relationships invite --peer=<did|username> [--json]");
  }
  try {
    await withKhoraClient(flags, async (client) => {
      const peerDid = await resolvePeerDid(client, peer);
      const out = await client.createRelationship({ peerDid });
      if (json) {
        console.log(JSON.stringify(out, null, 2));
        return;
      }
      console.log(`Invited ${out.relationship.peerDid} (${out.relationship.channelId})`);
    });
  } catch (e) {
    exitOnClientError(e, flags);
  }
}

export async function handleRelationshipsAccept(
  positional: string[],
  flags: FlagMap,
): Promise<void> {
  const json = boolFlag(flags, "json");
  const channelId = channelIdFromPositional(positional, "accept");
  try {
    await withKhoraClient(flags, async (client) => {
      const out = await client.acceptRelationship(channelId);
      if (json) {
        console.log(JSON.stringify(out, null, 2));
        return;
      }
      console.log(`Accepted ${out.relationship.channelId} with ${out.relationship.peerDid}`);
    });
  } catch (e) {
    exitOnClientError(e, flags);
  }
}

export async function handleRelationshipsDecline(
  positional: string[],
  flags: FlagMap,
): Promise<void> {
  const json = boolFlag(flags, "json");
  const channelId = channelIdFromPositional(positional, "decline");
  try {
    await withKhoraClient(flags, async (client) => {
      await client.declineRelationship(channelId);
      if (json) {
        console.log(JSON.stringify({ ok: true, channelId }, null, 2));
        return;
      }
      console.log(`Declined ${channelId}`);
    });
  } catch (e) {
    exitOnClientError(e, flags);
  }
}

export async function handleRelationshipsRevoke(
  positional: string[],
  flags: FlagMap,
): Promise<void> {
  const json = boolFlag(flags, "json");
  const channelId = channelIdFromPositional(positional, "revoke");
  try {
    await withKhoraClient(flags, async (client) => {
      await client.revokeRelationship(channelId);
      if (json) {
        console.log(JSON.stringify({ ok: true, channelId }, null, 2));
        return;
      }
      console.log(`Revoked ${channelId}`);
    });
  } catch (e) {
    exitOnClientError(e, flags);
  }
}

export async function handleRelationshipsDelete(
  positional: string[],
  flags: FlagMap,
): Promise<void> {
  const json = boolFlag(flags, "json");
  const channelId = channelIdFromPositional(positional, "delete");
  try {
    await withKhoraClient(flags, async (client) => {
      await client.deleteRelationship(channelId);
      if (json) {
        console.log(JSON.stringify({ ok: true, channelId }, null, 2));
        return;
      }
      console.log(`Deleted relationship ${channelId}`);
    });
  } catch (e) {
    exitOnClientError(e, flags);
  }
}
