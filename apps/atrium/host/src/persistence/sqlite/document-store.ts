import type { Database } from "bun:sqlite";
import type { AgentRelayEntityKind } from "@khoralabs/agent-relay";
import type { DefaultEntityMap, ResolvedSource, SourceMap, Store } from "@khoralabs/memories-core";
import type { TextFeatureExportRow } from "@khoralabs/memories-core/persistence";
import { migrateAtriumHostDb } from "./migrate-atrium-host-db.ts";

export type AgentRelayDocumentStoreParsers<EntityMap extends Record<string, unknown>> = {
  [K in keyof EntityMap & string]?: (raw: unknown) => EntityMap[K];
};

export type CreateAgentRelayDocumentStoreOptions<EntityMap extends Record<string, unknown>> = {
  /** Required for `{domain}:{id}` whole-document resolves; field paths do not use parsers. */
  parsers?: AgentRelayDocumentStoreParsers<EntityMap>;
};

type EntityDomain = AgentRelayEntityKind;

function isEntityDomain(d: string): d is EntityDomain {
  return d === "profile" || d === "post" || d === "topic";
}

/**
 * `profile:p1` → whole entity `p1`. `profile:p1:name` → field `name` on entity `p1`.
 * Field segment may contain `:` (joined remainder).
 */
function parseEntitySourceKey(
  sourceKey: string,
): { domain: EntityDomain; entityId: string; fieldPath?: string } | undefined {
  const parts = sourceKey.split(":");
  const head = parts[0];
  if (parts.length < 2 || head === undefined || !isEntityDomain(head)) {
    return undefined;
  }
  const domain = head;
  const entityId = parts[1];
  if (!entityId) {
    return undefined;
  }
  if (parts.length === 2) {
    return { domain, entityId };
  }
  const fieldPath = parts.slice(2).join(":");
  return fieldPath.length > 0 ? { domain, entityId, fieldPath } : { domain, entityId };
}

function fieldValueToResolvedString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined || value === null) {
    throw new Error("AgentRelayDocumentStore: missing field value");
  }
  return JSON.stringify(value);
}

/**
 * {@link Store} backed by host SQLite `host_entities` only.
 *
 * `source_key`: `{domain}:{id}` → whole `body_json` as `kind: "record"` (parser).
 * `{domain}:{id}:{field}` → one field from parsed JSON as `kind: "string"`.
 */
export function createAgentRelayDocumentStore<
  EntityMap extends Record<string, unknown> = DefaultEntityMap,
>(db: Database, options?: CreateAgentRelayDocumentStoreOptions<EntityMap>): Store<EntityMap> {
  migrateAtriumHostDb(db);
  const parsers = options?.parsers;

  const selectBodyForResolve = db.query<{ body_json: string }, [string, string, string]>(
    `SELECT body_json FROM host_entities WHERE kind = ? AND id = ? AND (memory_id IS NULL OR memory_id = ?)`,
  );
  const selectExistingForMerge = db.query<
    { body_json: string; memory_id: string | null },
    [string, string]
  >(`SELECT body_json, memory_id FROM host_entities WHERE kind = ? AND id = ?`);
  const updateBodyJson = db.prepare(
    `UPDATE host_entities SET body_json = ?, updated_at = ? WHERE kind = ? AND id = ?`,
  );
  const updateMemoryId = db.prepare(
    `UPDATE host_entities SET memory_id = ? WHERE kind = ? AND id = ?`,
  );
  const insertNew = db.prepare(
    `INSERT INTO host_entities (kind, id, memory_id, body_json, updated_at) VALUES (?, ?, ?, ?, ?)`,
  );

  function mergeEntityFieldFromSync(
    kind: EntityDomain,
    entityId: string,
    fieldPath: string,
    text: string,
    memoryId: string,
  ): void {
    const now = Date.now();
    const existing = selectExistingForMerge.get(kind, entityId);

    let body: Record<string, unknown>;
    if (existing != null) {
      body = JSON.parse(existing.body_json) as Record<string, unknown>;
    } else {
      body = {};
    }
    body[fieldPath] = text;
    const bodyJson = JSON.stringify(body);

    if (existing != null) {
      updateBodyJson.run(bodyJson, now, kind, entityId);
      if ((existing.memory_id === null || existing.memory_id === "") && memoryId !== "") {
        updateMemoryId.run(memoryId, kind, entityId);
      }
    } else {
      insertNew.run(kind, entityId, memoryId, bodyJson, now);
    }
  }

  return {
    resolve(sourcemap: SourceMap): Promise<ResolvedSource<EntityMap>> {
      const parsed = parseEntitySourceKey(sourcemap.source_key);
      if (parsed === undefined) {
        return Promise.reject(
          new Error(`AgentRelayDocumentStore: unrecognized source_key=${sourcemap.source_key}`),
        );
      }

      const row = selectBodyForResolve.get(parsed.domain, parsed.entityId, sourcemap.memory_id);
      const bodyJson = row?.body_json;
      if (bodyJson === undefined) {
        return Promise.reject(
          new Error(
            `AgentRelayDocumentStore: no ${parsed.domain} id=${parsed.entityId} for memory_id=${sourcemap.memory_id}`,
          ),
        );
      }

      const rawBody = JSON.parse(bodyJson) as unknown;

      if (parsed.fieldPath !== undefined) {
        if (typeof rawBody !== "object" || rawBody === null || !(parsed.fieldPath in rawBody)) {
          return Promise.reject(
            new Error(
              `AgentRelayDocumentStore: no field ${parsed.fieldPath} on ${parsed.domain}:${parsed.entityId}`,
            ),
          );
        }
        const v = (rawBody as Record<string, unknown>)[parsed.fieldPath];
        return Promise.resolve({
          kind: "string",
          string: fieldValueToResolvedString(v),
        });
      }

      const parser = (parsers as Record<string, ((raw: unknown) => unknown) | undefined>)[
        parsed.domain
      ];
      if (parser === undefined) {
        return Promise.reject(
          new Error(
            `AgentRelayDocumentStore: missing parser for whole-document resolve (${parsed.domain}:${parsed.entityId})`,
          ),
        );
      }
      const value = parser(rawBody);
      return Promise.resolve({
        kind: "record",
        domain: parsed.domain,
        entityId: parsed.entityId,
        value,
      } as ResolvedSource<EntityMap>);
    },

    syncFromTextExportRows(rows: readonly TextFeatureExportRow[]): void {
      for (const row of rows) {
        const parsed = parseEntitySourceKey(row.source_key);
        if (parsed?.fieldPath === undefined) {
          continue;
        }
        mergeEntityFieldFromSync(
          parsed.domain,
          parsed.entityId,
          parsed.fieldPath,
          row.text,
          row.memory_id,
        );
      }
    },
  };
}
