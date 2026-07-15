import type { Database } from "bun:sqlite";
import type { PrincipalId } from "@khoralabs/khora-contracts";
import type { SocialRelationshipPersistence, SocialRelationshipRow } from "@khoralabs/khora-host";
import { NAMESPACE_SOCIAL_RELATIONSHIP } from "./id-conventions";
import type { ProjectionStore } from "./projection-store";
import type { SocialPrincipalChannelStore } from "./social-principal-channel-store";

function parseRelationshipRow(
  projection: unknown,
  channelId: string,
): SocialRelationshipRow | undefined {
  if (projection === null || typeof projection !== "object" || Array.isArray(projection)) {
    return undefined;
  }
  const o = projection as Record<string, unknown>;
  const cid = typeof o.channelId === "string" ? o.channelId : channelId;
  const creatorPrincipalId =
    typeof o.creatorPrincipalId === "string" ? (o.creatorPrincipalId as PrincipalId) : undefined;
  if (creatorPrincipalId === undefined) return undefined;
  const peer =
    o.peerPrincipalId === null || o.peerPrincipalId === undefined
      ? null
      : typeof o.peerPrincipalId === "string"
        ? (o.peerPrincipalId as PrincipalId)
        : null;
  const createdAtMs = typeof o.createdAtMs === "number" ? o.createdAtMs : 0;
  const expiresAtMs = typeof o.expiresAtMs === "number" ? o.expiresAtMs : undefined;
  const metadata = "metadata" in o ? o.metadata : undefined;
  return {
    channelId: cid,
    creatorPrincipalId,
    peerPrincipalId: peer,
    createdAtMs,
    ...(expiresAtMs !== undefined ? { expiresAtMs } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
  };
}

export function createSocialRelationshipPersistence(deps: {
  projectionStore: ProjectionStore;
  principalChannelStore: SocialPrincipalChannelStore;
  catalogDb: Database;
  tenantKey: string;
}): SocialRelationshipPersistence {
  const { projectionStore: store, principalChannelStore, catalogDb, tenantKey } = deps;

  function getImpl(channelId: string): SocialRelationshipRow | undefined {
    const { found, projection } = store.lookupProjection(
      tenantKey,
      NAMESPACE_SOCIAL_RELATIONSHIP,
      channelId,
    );
    if (!found) return undefined;
    return parseRelationshipRow(projection, channelId);
  }

  return {
    createRelationship(params): void {
      const now = Date.now();
      const row: SocialRelationshipRow = {
        channelId: params.channelId,
        creatorPrincipalId: params.creatorPrincipalId,
        peerPrincipalId: null,
        createdAtMs: now,
        ...(params.expiresAtMs !== undefined ? { expiresAtMs: params.expiresAtMs } : {}),
        ...(params.metadata !== undefined ? { metadata: params.metadata } : {}),
      };
      catalogDb.transaction(() => {
        store.upsert({
          tenant_key: tenantKey,
          namespace: NAMESPACE_SOCIAL_RELATIONSHIP,
          entry_key: params.channelId,
          projection: row,
        });
        principalChannelStore.insertChannel(tenantKey, params.creatorPrincipalId, params.channelId);
      })();
    },

    getRelationship: getImpl,

    bindPeer(params): void {
      catalogDb.transaction(() => {
        const { found, projection } = store.lookupProjection(
          tenantKey,
          NAMESPACE_SOCIAL_RELATIONSHIP,
          params.channelId,
        );
        if (!found) throw new Error(`SocialRelationship: unknown channel ${params.channelId}`);
        const current = parseRelationshipRow(projection, params.channelId);
        if (current === undefined)
          throw new Error(`SocialRelationship: corrupt row for ${params.channelId}`);
        if (current.peerPrincipalId !== null) {
          if (current.peerPrincipalId === params.peerPrincipalId) return;
          throw new Error(
            `SocialRelationship: channel ${params.channelId} already bound to another peer`,
          );
        }
        if (params.peerPrincipalId === current.creatorPrincipalId)
          throw new Error("SocialRelationship: peer cannot be the creator");
        store.upsert({
          tenant_key: tenantKey,
          namespace: NAMESPACE_SOCIAL_RELATIONSHIP,
          entry_key: params.channelId,
          projection: { ...current, peerPrincipalId: params.peerPrincipalId },
        });
        principalChannelStore.insertChannel(tenantKey, params.peerPrincipalId, params.channelId);
      })();
    },

    refreshRelationshipTicketExpiry(params): void {
      catalogDb.transaction(() => {
        const current = getImpl(params.channelId);
        if (current === undefined) return;
        store.upsert({
          tenant_key: tenantKey,
          namespace: NAMESPACE_SOCIAL_RELATIONSHIP,
          entry_key: params.channelId,
          projection: { ...current, expiresAtMs: params.expiresAtMs },
        });
      })();
    },

    listRelationshipsForPrincipal(principalId: PrincipalId): SocialRelationshipRow[] {
      const ids = principalChannelStore.listChannelIds(tenantKey, principalId);
      const out: SocialRelationshipRow[] = [];
      for (let i = ids.length - 1; i >= 0; i--) {
        const channelId = ids[i];
        if (channelId === undefined) continue;
        const row = getImpl(channelId);
        if (row !== undefined) out.push(row);
      }
      return out;
    },

    deleteRelationship(channelId: string): SocialRelationshipRow | undefined {
      const r = getImpl(channelId);
      if (r === undefined) return undefined;
      catalogDb.transaction(() => {
        store.deleteRow(tenantKey, NAMESPACE_SOCIAL_RELATIONSHIP, channelId);
        principalChannelStore.deleteChannel(tenantKey, r.creatorPrincipalId, channelId);
        if (r.peerPrincipalId !== null) {
          principalChannelStore.deleteChannel(tenantKey, r.peerPrincipalId, channelId);
        }
      })();
      return r;
    },
  };
}
