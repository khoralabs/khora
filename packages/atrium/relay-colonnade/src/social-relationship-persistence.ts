import type { Database } from "bun:sqlite";
import type { PrincipalId } from "@khoralabs/agent-relay";
import type { RelayCatalogProjectionStore } from "./catalog-projection-store.ts";
import {
  RELAY_NAMESPACE_SOCIAL_RELATIONSHIP,
  RELAY_NAMESPACE_SOCIAL_RELATIONSHIPS_BY_PRINCIPAL,
} from "./relay-id-conventions.ts";
import type { SocialRelationshipPersistence, SocialRelationshipRow } from "./social-types.ts";

const NAMESPACE_RELATIONSHIP = RELAY_NAMESPACE_SOCIAL_RELATIONSHIP;
const NAMESPACE_BY_PRINCIPAL = RELAY_NAMESPACE_SOCIAL_RELATIONSHIPS_BY_PRINCIPAL;

function readChannelIds(projection: unknown): string[] {
  if (projection === null || typeof projection !== "object" || Array.isArray(projection)) {
    return [];
  }
  const raw = (projection as Record<string, unknown>).channelIds;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((x): x is string => typeof x === "string");
}

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

function upsertPrincipalIndex(
  store: RelayCatalogProjectionStore,
  tenantKey: string,
  principalId: PrincipalId,
  channelIds: string[],
): void {
  store.upsert({
    tenant_key: tenantKey,
    namespace: NAMESPACE_BY_PRINCIPAL,
    entry_key: principalId,
    projection: { channelIds },
  });
}

function appendChannelForPrincipal(
  store: RelayCatalogProjectionStore,
  tenantKey: string,
  principalId: PrincipalId,
  channelId: string,
): void {
  const { found, projection } = store.lookupProjection(
    tenantKey,
    NAMESPACE_BY_PRINCIPAL,
    principalId,
  );
  const prev = found ? readChannelIds(projection) : [];
  if (prev.includes(channelId)) {
    return;
  }
  upsertPrincipalIndex(store, tenantKey, principalId, [...prev, channelId]);
}

export function createSocialRelationshipPersistence(deps: {
  projectionStore: RelayCatalogProjectionStore;
  catalogDb: Database;
  framesDb: Database;
  tenantKey: string;
}): SocialRelationshipPersistence {
  const { projectionStore: store, catalogDb, framesDb, tenantKey } = deps;

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
        appendChannelForPrincipal(store, tenantKey, params.creatorPrincipalId, params.channelId);
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
        appendChannelForPrincipal(store, tenantKey, params.peerPrincipalId, params.channelId);
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
      const { found, projection } = store.lookupProjection(
        tenantKey,
        NAMESPACE_BY_PRINCIPAL,
        principalId,
      );
      if (!found) {
        return [];
      }
      const ids = readChannelIds(projection);
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
        stripChannelFromPrincipalSocialIndex(store, tenantKey, r.creatorPrincipalId, channelId);
        if (r.peerPrincipalId !== null) {
          stripChannelFromPrincipalSocialIndex(store, tenantKey, r.peerPrincipalId, channelId);
        }
      })();
      framesDb.prepare(`DELETE FROM room_frames WHERE channel_id = ?`).run(channelId);
      framesDb.prepare(`DELETE FROM rooms WHERE channel_id = ?`).run(channelId);
      return r;
    },
  };
}

function stripChannelFromPrincipalSocialIndex(
  store: RelayCatalogProjectionStore,
  tenantKey: string,
  principalId: PrincipalId,
  channelId: string,
): void {
  const { found, projection } = store.lookupProjection(
    tenantKey,
    NAMESPACE_BY_PRINCIPAL,
    principalId,
  );
  if (!found) {
    return;
  }
  const ids = readChannelIds(projection).filter((id) => id !== channelId);
  if (ids.length === 0) {
    store.deleteRow(tenantKey, NAMESPACE_BY_PRINCIPAL, principalId);
    return;
  }
  upsertPrincipalIndex(store, tenantKey, principalId, ids);
}

/** Tear down frame-channel rows + catalog relationship entries for every room this principal participates in. */
export function purgeSocialRelationshipsForPrincipal(params: {
  projectionStore: RelayCatalogProjectionStore;
  catalogDb: Database;
  framesDb: Database;
  tenantKey: string;
  principalId: PrincipalId;
}): void {
  const social = createSocialRelationshipPersistence(params);
  const rels = social.listRelationshipsForPrincipal(params.principalId);
  for (const r of rels) {
    social.deleteRelationship(r.channelId);
  }
}
