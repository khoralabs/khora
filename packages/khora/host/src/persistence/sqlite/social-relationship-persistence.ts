import type { Database } from "bun:sqlite";
import type { PrincipalId } from "@khoralabs/khora-contracts";
import { NAMESPACE_SOCIAL_RELATIONSHIP } from "../core/id-conventions";
import type { SocialRelationshipPersistence, SocialRelationshipRow } from "../core/port";
import { parseRelationshipRow } from "../core/row-map";
import type { ProjectionStore } from "./projection-store";
import type { SocialPrincipalChannelStore } from "./social-principal-channel-store";

export function createSocialRelationshipPersistence(deps: {
  projectionStore: ProjectionStore;
  principalChannelStore: SocialPrincipalChannelStore;
  hostDb: Database;
  tenantKey: string;
}): SocialRelationshipPersistence {
  const { projectionStore: store, principalChannelStore, hostDb, tenantKey } = deps;

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
      hostDb.transaction(() => {
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
      hostDb.transaction(() => {
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
      hostDb.transaction(() => {
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
      hostDb.transaction(() => {
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
