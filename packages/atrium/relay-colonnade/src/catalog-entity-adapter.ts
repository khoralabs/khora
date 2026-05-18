import type { Database } from "bun:sqlite";
import type {
  AgentRelayEntityPersistence,
  AgentRelayEntityRow,
  AgentRelayEntityUpsert,
} from "@khoralabs/agent-relay";
import { type RelayCatalogSourceMapStore, relaySyntheticPointer } from "./catalog-source-map-store";

export function parseEntityRow(projection: unknown, id: string): AgentRelayEntityRow | undefined {
  if (projection === null || typeof projection !== "object" || Array.isArray(projection)) {
    return undefined;
  }
  const o = projection as Record<string, unknown>;
  if (o.deleted === true) {
    return undefined;
  }
  const rowId = typeof o.id === "string" ? o.id : id;
  const memoryId =
    o.memoryId === null || o.memoryId === undefined
      ? null
      : typeof o.memoryId === "string"
        ? o.memoryId
        : null;
  const bodyJson = typeof o.bodyJson === "string" ? o.bodyJson : "";
  const updatedAtMs = typeof o.updatedAtMs === "number" ? o.updatedAtMs : 0;
  return { id: rowId, memoryId, bodyJson, updatedAtMs };
}

export function createCatalogEntityAdapter(
  store: RelayCatalogSourceMapStore,
  db: Database,
  tenantKey: string,
  sourceMapId: string,
): AgentRelayEntityPersistence {
  return {
    upsert(record: AgentRelayEntityUpsert): void {
      const projection = {
        id: record.id,
        memoryId: record.memoryId ?? null,
        bodyJson: record.bodyJson,
        updatedAtMs: Date.now(),
      };
      const pointer = relaySyntheticPointer(tenantKey, sourceMapId, record.id);
      db.transaction(() => {
        store.upsertRow({
          tenant_key: tenantKey,
          source_map_id: sourceMapId,
          entry_key: record.id,
          pointer,
          projection,
        });
      })();
    },

    getById(id: string): AgentRelayEntityRow | undefined {
      const { found, projection } = store.lookupProjection(tenantKey, sourceMapId, id);
      if (!found) {
        return undefined;
      }
      return parseEntityRow(projection, id);
    },

    deleteById(id: string): void {
      const pointer = relaySyntheticPointer(tenantKey, sourceMapId, id);
      db.transaction(() => {
        store.upsertRow({
          tenant_key: tenantKey,
          source_map_id: sourceMapId,
          entry_key: id,
          pointer,
          projection: { deleted: true },
        });
      })();
    },
  };
}
