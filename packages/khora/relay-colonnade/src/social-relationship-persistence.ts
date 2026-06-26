import type { Database } from "bun:sqlite";
import type {
  PrincipalId,
  SocialRelationshipPersistence,
  SocialRelationshipRow,
} from "@khoralabs/host-runtime";
import type { RelayCatalogProjectionStore } from "./catalog-projection-store";
import { RELAY_NAMESPACE_SOCIAL_RELATIONSHIP } from "./relay-id-conventions";
import type { RelaySocialPrincipalChannelStore } from "./relay-social-principal-channel-store";

const NAMESPACE_RELATIONSHIP = RELAY_NAMESPACE_SOCIAL_RELATIONSHIP;

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
  if (creatorPrincipalId === undefined) {
    return undefined;
  }
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
  projectionStore: RelayCatalogProjectionStore;
  principalChannelStore: RelaySocialPrincipalChannelStore;
  catalogDb: Database;
  tenantKey: string;
}): SocialRelationshipPersistence {
  const { projectionStore: store, principalChannelStore, catalogDb, tenantKey } = deps;

  function getRelationshipImpl(channelId: string): SocialRelationshipRow | undefined {
    const { found, projection } = store.lookupProjection(
      tenantKey,
      NAMESPACE_RELATIONSHIP,
      channelId,
    );
    if (!found) {
      return undefined;
    }
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
          namespace: NAMESPACE_RELATIONSHIP,
          entry_key: params.channelId,
          projection: row,
        });
        principalChannelStore.insertChannel(tenantKey, params.creatorPrincipalId, params.channelId);
      })();
    },

    getRelationship(channelId: string): SocialRelationshipRow | undefined {
      return getRelationshipImpl(channelId);
    },

    bindPeer(params): void {
      catalogDb.transaction(() => {
        const { found, projection } = store.lookupProjection(
          tenantKey,
          NAMESPACE_RELATIONSHIP,
          params.channelId,
        );
        if (!found) {
          throw new Error(`SocialRelationship: unknown channel ${params.channelId}`);
        }
        const current = parseRelationshipRow(projection, params.channelId);
        if (current === undefined) {
          throw new Error(`SocialRelationship: corrupt row for ${params.channelId}`);
        }
        if (current.peerPrincipalId !== null) {
          if (current.peerPrincipalId === params.peerPrincipalId) {
            return;
          }
          throw new Error(
            `SocialRelationship: channel ${params.channelId} already bound to another peer`,
          );
        }
        if (params.peerPrincipalId === current.creatorPrincipalId) {
          throw new Error("SocialRelationship: peer cannot be the creator");
        }
        const next: SocialRelationshipRow = {
          ...current,
          peerPrincipalId: params.peerPrincipalId,
        };
        store.upsert({
          tenant_key: tenantKey,
          namespace: NAMESPACE_RELATIONSHIP,
          entry_key: params.channelId,
          projection: next,
        });
        principalChannelStore.insertChannel(tenantKey, params.peerPrincipalId, params.channelId);
      })();
    },

    refreshRelationshipTicketExpiry(params: { channelId: string; expiresAtMs: number }): void {
      catalogDb.transaction(() => {
        const current = getRelationshipImpl(params.channelId);
        if (current === undefined) return;
        const next: SocialRelationshipRow = { ...current, expiresAtMs: params.expiresAtMs };
        store.upsert({
          tenant_key: tenantKey,
          namespace: NAMESPACE_RELATIONSHIP,
          entry_key: params.channelId,
          projection: next,
        });
      })();
    },

    listRelationshipsForPrincipal(principalId: PrincipalId): SocialRelationshipRow[] {
      const ids = principalChannelStore.listChannelIds(tenantKey, principalId);
      const out: SocialRelationshipRow[] = [];
      for (let i = ids.length - 1; i >= 0; i--) {
        const channelId = ids[i];
        if (channelId === undefined) {
          continue;
        }
        const row = getRelationshipImpl(channelId);
        if (row !== undefined) {
          out.push(row);
        }
      }
      return out;
    },

    deleteRelationship(channelId: string): SocialRelationshipRow | undefined {
      const r = getRelationshipImpl(channelId);
      if (r === undefined) {
        return undefined;
      }
      catalogDb.transaction(() => {
        store.deleteRow(tenantKey, NAMESPACE_RELATIONSHIP, channelId);
        principalChannelStore.deleteChannel(tenantKey, r.creatorPrincipalId, channelId);
        if (r.peerPrincipalId !== null) {
          principalChannelStore.deleteChannel(tenantKey, r.peerPrincipalId, channelId);
        }
      })();
      return r;
    },
  };
}

/** Tear down catalog relationship entries for every channel this principal participates in. */
export function purgeSocialRelationshipsForPrincipal(params: {
  projectionStore: RelayCatalogProjectionStore;
  principalChannelStore: RelaySocialPrincipalChannelStore;
  catalogDb: Database;
  tenantKey: string;
  principalId: PrincipalId;
}): void {
  const social = createSocialRelationshipPersistence(params);
  const rels = social.listRelationshipsForPrincipal(params.principalId);
  for (const r of rels) {
    social.deleteRelationship(r.channelId);
  }
}
