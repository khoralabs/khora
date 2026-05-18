import type { Database } from "bun:sqlite";
import type { PrincipalId } from "@khoralabs/agent-relay";
import {
  type RelayCatalogSourceMapStore,
  relaySyntheticPointer,
} from "./catalog-source-map-store.ts";
import type { SocialRelationshipPersistence, SocialRelationshipRow } from "./social-types.ts";

const SOURCE_RELATIONSHIP = "relay:social:relationship";
const SOURCE_BY_PRINCIPAL = "relay:social:relationships-by-principal";

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
  store: RelayCatalogSourceMapStore,
  tenantKey: string,
  principalId: PrincipalId,
  channelIds: string[],
): void {
  const pointer = relaySyntheticPointer(tenantKey, SOURCE_BY_PRINCIPAL, principalId);
  store.upsertRow({
    tenant_key: tenantKey,
    source_map_id: SOURCE_BY_PRINCIPAL,
    entry_key: principalId,
    pointer,
    projection: { channelIds },
  });
}

function appendChannelForPrincipal(
  store: RelayCatalogSourceMapStore,
  tenantKey: string,
  principalId: PrincipalId,
  channelId: string,
): void {
  const { found, projection } = store.lookupProjection(tenantKey, SOURCE_BY_PRINCIPAL, principalId);
  const prev = found ? readChannelIds(projection) : [];
  if (prev.includes(channelId)) {
    return;
  }
  upsertPrincipalIndex(store, tenantKey, principalId, [...prev, channelId]);
}

export function createSocialRelationshipPersistence(deps: {
  store: RelayCatalogSourceMapStore;
  catalogDb: Database;
  tenantKey: string;
}): SocialRelationshipPersistence {
  const { store, catalogDb, tenantKey } = deps;

  function getRelationshipImpl(channelId: string): SocialRelationshipRow | undefined {
    const { found, projection } = store.lookupProjection(tenantKey, SOURCE_RELATIONSHIP, channelId);
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
      const pointer = relaySyntheticPointer(tenantKey, SOURCE_RELATIONSHIP, params.channelId);
      catalogDb.transaction(() => {
        store.upsertRow({
          tenant_key: tenantKey,
          source_map_id: SOURCE_RELATIONSHIP,
          entry_key: params.channelId,
          pointer,
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
          SOURCE_RELATIONSHIP,
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
        const pointer = relaySyntheticPointer(tenantKey, SOURCE_RELATIONSHIP, params.channelId);
        store.upsertRow({
          tenant_key: tenantKey,
          source_map_id: SOURCE_RELATIONSHIP,
          entry_key: params.channelId,
          pointer,
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
        const pointer = relaySyntheticPointer(tenantKey, SOURCE_RELATIONSHIP, params.channelId);
        store.upsertRow({
          tenant_key: tenantKey,
          source_map_id: SOURCE_RELATIONSHIP,
          entry_key: params.channelId,
          pointer,
          projection: next,
        });
      })();
    },

    listRelationshipsForPrincipal(principalId: PrincipalId): SocialRelationshipRow[] {
      const { found, projection } = store.lookupProjection(
        tenantKey,
        SOURCE_BY_PRINCIPAL,
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
  };
}

function stripChannelFromPrincipalSocialIndex(
  store: RelayCatalogSourceMapStore,
  tenantKey: string,
  principalId: PrincipalId,
  channelId: string,
): void {
  const { found, projection } = store.lookupProjection(tenantKey, SOURCE_BY_PRINCIPAL, principalId);
  if (!found) {
    return;
  }
  const ids = readChannelIds(projection).filter((id) => id !== channelId);
  if (ids.length === 0) {
    store.deleteRow(tenantKey, SOURCE_BY_PRINCIPAL, principalId);
    return;
  }
  upsertPrincipalIndex(store, tenantKey, principalId, ids);
}

/** Tear down frame-channel rows + catalog relationship entries for every room this principal participates in. */
export function purgeSocialRelationshipsForPrincipal(params: {
  store: RelayCatalogSourceMapStore;
  catalogDb: Database;
  framesDb: Database;
  tenantKey: string;
  principalId: PrincipalId;
}): void {
  const { store, catalogDb, framesDb, tenantKey, principalId } = params;
  const social = createSocialRelationshipPersistence({ store, catalogDb, tenantKey });
  const rels = social.listRelationshipsForPrincipal(principalId);
  const delFrames = framesDb.prepare(`DELETE FROM room_frames WHERE channel_id = ?`);
  const delRoom = framesDb.prepare(`DELETE FROM rooms WHERE channel_id = ?`);
  for (const r of rels) {
    catalogDb.transaction(() => {
      store.deleteRow(tenantKey, SOURCE_RELATIONSHIP, r.channelId);
      stripChannelFromPrincipalSocialIndex(store, tenantKey, r.creatorPrincipalId, r.channelId);
      if (r.peerPrincipalId !== null) {
        stripChannelFromPrincipalSocialIndex(store, tenantKey, r.peerPrincipalId, r.channelId);
      }
    })();
    delFrames.run(r.channelId);
    delRoom.run(r.channelId);
  }
}
