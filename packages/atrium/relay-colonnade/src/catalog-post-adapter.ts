import type { Database } from "bun:sqlite";
import type {
  AgentRelayEntityRow,
  AgentRelayEntityUpsert,
  AgentRelayPostPersistence,
} from "@khoralabs/agent-relay";
import { createCatalogEntityAdapter, parseEntityRow } from "./catalog-entity-adapter.ts";
import {
  type RelayCatalogSourceMapStore,
  relaySyntheticPointer,
} from "./catalog-source-map-store.ts";

/** `source_map_id` for post entities in the relay catalog (use with {@link relaySyntheticPointer}). */
export const RELAY_CATALOG_SOURCE_POST = "relay:entity:post";
const SOURCE_POST = RELAY_CATALOG_SOURCE_POST;
const SOURCE_POST_INDEX = "relay:post-index";

function postIndexEntryKey(authorProfileId: string, kind: string): string {
  return `${authorProfileId}:${kind}`;
}

export function parsePostMeta(bodyJson: string): { authorProfileId: string; kind: string } {
  try {
    const o = JSON.parse(bodyJson) as Record<string, unknown>;
    const authorProfileId =
      typeof o.authorProfileId === "string"
        ? o.authorProfileId
        : typeof o.author_profile_id === "string"
          ? o.author_profile_id
          : "";
    const kind = typeof o.kind === "string" ? o.kind : "";
    return { authorProfileId, kind };
  } catch {
    return { authorProfileId: "", kind: "" };
  }
}

function readPostIdList(projection: unknown): string[] {
  if (projection === null || typeof projection !== "object" || Array.isArray(projection)) {
    return [];
  }
  const raw = (projection as Record<string, unknown>).postIds;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((x): x is string => typeof x === "string");
}

function upsertPostIndex(
  store: RelayCatalogSourceMapStore,
  tenantKey: string,
  indexKey: string,
  postIds: string[],
): void {
  const pointer = relaySyntheticPointer(tenantKey, SOURCE_POST_INDEX, indexKey);
  store.upsertRow({
    tenant_key: tenantKey,
    source_map_id: SOURCE_POST_INDEX,
    entry_key: indexKey,
    pointer,
    projection: { postIds },
  });
}

function removePostIdFromIndex(
  store: RelayCatalogSourceMapStore,
  tenantKey: string,
  authorProfileId: string,
  kind: string,
  postId: string,
): void {
  if (!authorProfileId || !kind) {
    return;
  }
  const indexKey = postIndexEntryKey(authorProfileId, kind);
  const { found, projection } = store.lookupProjection(tenantKey, SOURCE_POST_INDEX, indexKey);
  if (!found) {
    return;
  }
  const ids = readPostIdList(projection).filter((id) => id !== postId);
  upsertPostIndex(store, tenantKey, indexKey, ids);
}

function addPostIdToIndex(
  store: RelayCatalogSourceMapStore,
  tenantKey: string,
  authorProfileId: string,
  kind: string,
  postId: string,
): void {
  if (!authorProfileId || !kind) {
    return;
  }
  const indexKey = postIndexEntryKey(authorProfileId, kind);
  const { found, projection } = store.lookupProjection(tenantKey, SOURCE_POST_INDEX, indexKey);
  const prev = found ? readPostIdList(projection) : [];
  if (prev.includes(postId)) {
    return;
  }
  upsertPostIndex(store, tenantKey, indexKey, [...prev, postId]);
}

export function createCatalogPostAdapter(
  store: RelayCatalogSourceMapStore,
  db: Database,
  tenantKey: string,
): AgentRelayPostPersistence {
  const base = createCatalogEntityAdapter(store, db, tenantKey, SOURCE_POST);

  return {
    upsert(record: AgentRelayEntityUpsert): void {
      const existing = base.getById(record.id);
      const oldMeta = existing ? parsePostMeta(existing.bodyJson) : null;
      const newMeta = parsePostMeta(record.bodyJson);
      const projection = {
        id: record.id,
        memoryId: record.memoryId ?? null,
        bodyJson: record.bodyJson,
        updatedAtMs: Date.now(),
      };
      const pointer = relaySyntheticPointer(tenantKey, SOURCE_POST, record.id);
      db.transaction(() => {
        if (oldMeta?.authorProfileId && oldMeta.kind) {
          const bucketChanged =
            oldMeta.authorProfileId !== newMeta.authorProfileId || oldMeta.kind !== newMeta.kind;
          const droppedMeta = !newMeta.authorProfileId || !newMeta.kind;
          if (bucketChanged || droppedMeta) {
            removePostIdFromIndex(
              store,
              tenantKey,
              oldMeta.authorProfileId,
              oldMeta.kind,
              record.id,
            );
          }
        }
        store.upsertRow({
          tenant_key: tenantKey,
          source_map_id: SOURCE_POST,
          entry_key: record.id,
          pointer,
          projection,
        });
        if (newMeta.authorProfileId && newMeta.kind) {
          addPostIdToIndex(store, tenantKey, newMeta.authorProfileId, newMeta.kind, record.id);
        }
      })();
    },

    getById: (id) => base.getById(id),

    deleteById(id: string): void {
      const row = base.getById(id);
      const meta = row ? parsePostMeta(row.bodyJson) : null;
      const pointer = relaySyntheticPointer(tenantKey, SOURCE_POST, id);
      db.transaction(() => {
        store.upsertRow({
          tenant_key: tenantKey,
          source_map_id: SOURCE_POST,
          entry_key: id,
          pointer,
          projection: { deleted: true },
        });
        if (meta?.authorProfileId && meta.kind) {
          removePostIdFromIndex(store, tenantKey, meta.authorProfileId, meta.kind, id);
        }
      })();
    },

    listRowsByAuthorProfileIdAndKind(params: {
      authorProfileId: string;
      kind: string;
      limit: number;
    }): AgentRelayEntityRow[] {
      const indexKey = postIndexEntryKey(params.authorProfileId, params.kind);
      const { found, projection } = store.lookupProjection(tenantKey, SOURCE_POST_INDEX, indexKey);
      if (!found) {
        return [];
      }
      const postIds = readPostIdList(projection);
      const out: AgentRelayEntityRow[] = [];
      for (let i = postIds.length - 1; i >= 0 && out.length < params.limit; i--) {
        const pid = postIds[i];
        if (pid === undefined) {
          continue;
        }
        const { found: f2, projection: p2 } = store.lookupProjection(tenantKey, SOURCE_POST, pid);
        if (!f2) {
          continue;
        }
        const row = parseEntityRow(p2, pid);
        if (row) {
          out.push(row);
        }
      }
      return out;
    },
  };
}

/** Physically remove post entity + index buckets (not a tombstone). */
export function purgeRelayCatalogPostEntity(
  store: RelayCatalogSourceMapStore,
  db: Database,
  tenantKey: string,
  postId: string,
): void {
  const { found, projection } = store.lookupProjection(tenantKey, SOURCE_POST, postId);
  if (!found) {
    return;
  }
  const row = parseEntityRow(projection, postId);
  const meta = row ? parsePostMeta(row.bodyJson) : null;
  db.transaction(() => {
    if (meta?.authorProfileId && meta.kind) {
      removePostIdFromIndex(store, tenantKey, meta.authorProfileId, meta.kind, postId);
    }
    store.deleteRow(tenantKey, SOURCE_POST, postId);
  })();
}
