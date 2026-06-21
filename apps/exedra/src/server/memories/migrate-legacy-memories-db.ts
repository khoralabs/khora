import type { Database } from "bun:sqlite";
import { ids, namespacePath, namespacePrefixFields, stableId } from "@khoralabs/memories-core";

import { migrateNamespacePathWithSegmentMap } from "./encode-principal-id-legacy.js";

type MemoryRow = {
  _id: string;
  _ts_created: number;
  namespace: string;
  key: string;
  kind: string;
  edge_id: string | null;
};

function rebuildScopeClosure(db: Database, now: number): void {
  db.run(`DELETE FROM scope_closure`);

  const scopeRows = db.query<{ _id: string }, []>(`SELECT _id FROM scopes`).all();
  if (scopeRows.length === 0) return;

  const edgeRows = db
    .query<{ parent_scope_id: string; child_scope_id: string }, []>(
      `SELECT parent_scope_id, child_scope_id FROM scope_edges`,
    )
    .all();
  const adj = new Map<string, string[]>();
  for (const row of edgeRows) {
    const list = adj.get(row.parent_scope_id) ?? [];
    list.push(row.child_scope_id);
    adj.set(row.parent_scope_id, list);
  }

  for (const { _id: ancestor } of scopeRows) {
    const stack = [ancestor];
    const seen = new Set<string>();
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined || seen.has(current)) continue;
      seen.add(current);
      const rowId = stableId("sclo", ancestor, current);
      db.run(
        `INSERT OR REPLACE INTO scope_closure (_id, _ts_created, ancestor_scope_id, descendant_scope_id) VALUES (?, ?, ?, ?)`,
        [rowId, now, ancestor, current],
      );
      for (const child of adj.get(current) ?? []) {
        if (!seen.has(child)) stack.push(child);
      }
    }
  }
}

function migrateScopePaths(
  db: Database,
  segmentMap: ReadonlyMap<string, string>,
): Map<string, string> {
  const scopeIdMap = new Map<string, string>();
  const scopeIds = db.query<{ _id: string }, []>(`SELECT _id FROM scopes`).all();
  for (const { _id } of scopeIds) {
    const migrated = migrateNamespacePathWithSegmentMap(_id, segmentMap);
    if (migrated !== _id) scopeIdMap.set(_id, migrated);
  }
  if (scopeIdMap.size === 0) return scopeIdMap;

  for (const [oldId, newId] of scopeIdMap) {
    const row = db
      .query<{ _ts_created: number }, [string]>(`SELECT _ts_created FROM scopes WHERE _id = ?`)
      .get(oldId);
    if (row == null) continue;
    db.run(`INSERT OR IGNORE INTO scopes (_id, _ts_created) VALUES (?, ?)`, [
      newId,
      row._ts_created,
    ]);
    db.run(`UPDATE scope_edges SET parent_scope_id = ? WHERE parent_scope_id = ?`, [newId, oldId]);
    db.run(`UPDATE scope_edges SET child_scope_id = ? WHERE child_scope_id = ?`, [newId, oldId]);
    db.run(`UPDATE memory_scopes SET scope_id = ? WHERE scope_id = ?`, [newId, oldId]);
    db.run(`DELETE FROM scopes WHERE _id = ?`, [oldId]);
  }

  return scopeIdMap;
}

function migrateMemoryRows(
  db: Database,
  scopeIdMap: Map<string, string>,
  segmentMap: ReadonlyMap<string, string>,
): number {
  const memoryRows = db
    .query<MemoryRow, []>(`SELECT _id, _ts_created, namespace, key, kind, edge_id FROM memories`)
    .all();
  let migratedCount = 0;

  for (const row of memoryRows) {
    const newNamespace = migrateNamespacePathWithSegmentMap(row.namespace, segmentMap);
    if (newNamespace === row.namespace) continue;

    const newMemoryId = ids.memory(newNamespace, row.key);
    const prefixes = namespacePrefixFields(namespacePath(newNamespace));
    const oldMemoryId = row._id;
    const oldNamespace = row.namespace;

    db.run(
      `INSERT INTO memories (
         _id, _ts_created, namespace, key, kind, edge_id,
         ns_prefix_1, ns_prefix_2, ns_prefix_3, ns_prefix_4, ns_prefix_5, ns_prefix_6
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newMemoryId,
        row._ts_created,
        newNamespace,
        row.key,
        row.kind,
        row.edge_id,
        prefixes.ns_prefix_1 ?? null,
        prefixes.ns_prefix_2 ?? null,
        prefixes.ns_prefix_3 ?? null,
        prefixes.ns_prefix_4 ?? null,
        prefixes.ns_prefix_5 ?? null,
        prefixes.ns_prefix_6 ?? null,
      ],
    );

    const oldNodeId = ids.node(oldNamespace, row.key);
    const newNodeId = ids.node(newNamespace, row.key);
    db.run(`UPDATE nodes SET _id = ?, memory_id = ? WHERE _id = ?`, [
      newNodeId,
      newMemoryId,
      oldNodeId,
    ]);
    db.run(`UPDATE edges SET from_node_id = ? WHERE from_node_id = ?`, [newNodeId, oldNodeId]);
    db.run(`UPDATE edges SET to_node_id = ? WHERE to_node_id = ?`, [newNodeId, oldNodeId]);

    const sourceMaps = db
      .query<
        { _id: string; _ts_created: number; source_key: string; content_hash: string | null },
        [string]
      >(`SELECT _id, _ts_created, source_key, content_hash FROM source_maps WHERE memory_id = ?`)
      .all(oldMemoryId);

    for (const sourceMap of sourceMaps) {
      const newSourceMapId = ids.sourceMap(newMemoryId, sourceMap.source_key);
      db.run(
        `INSERT INTO source_maps (_id, _ts_created, memory_id, source_key, content_hash) VALUES (?, ?, ?, ?, ?)`,
        [
          newSourceMapId,
          sourceMap._ts_created,
          newMemoryId,
          sourceMap.source_key,
          sourceMap.content_hash,
        ],
      );

      const textFeatures = db
        .query<{ _id: string; _ts_created: number; text: string }, [string]>(
          `SELECT _id, _ts_created, text FROM text_features WHERE source_map_id = ?`,
        )
        .all(sourceMap._id);

      for (const textFeature of textFeatures) {
        const newTextFeatureId = ids.textFeature(newSourceMapId);
        db.run(`DELETE FROM text_features_fts WHERE text_feature_id = ?`, [textFeature._id]);
        db.run(
          `INSERT INTO text_features (_id, _ts_created, memory_id, source_map_id, text) VALUES (?, ?, ?, ?, ?)`,
          [
            newTextFeatureId,
            textFeature._ts_created,
            newMemoryId,
            newSourceMapId,
            textFeature.text,
          ],
        );
        db.run(
          `INSERT INTO text_features_fts (text_feature_id, memory_id, source_map_id, text) VALUES (?, ?, ?, ?)`,
          [newTextFeatureId, newMemoryId, newSourceMapId, textFeature.text],
        );
        db.run(`DELETE FROM text_features WHERE _id = ?`, [textFeature._id]);
      }

      const vectorFeatures = db
        .query<{ _id: string; _ts_created: number; vector: Uint8Array }, [string]>(
          `SELECT _id, _ts_created, vector FROM vector_features WHERE source_map_id = ?`,
        )
        .all(sourceMap._id);

      for (const vectorFeature of vectorFeatures) {
        const newVectorFeatureId = ids.vectorFeature(newSourceMapId);

        const vecTables = db
          .query<{ name: string }, [string]>(
            `SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'vector_features_vec_d_%'`,
          )
          .all("vector_features_vec_d_%");
        for (const { name } of vecTables) {
          const escaped = name.replaceAll('"', '""');
          const vecRow = db
            .query<{ embedding: Uint8Array }, [string]>(
              `SELECT embedding FROM "${escaped}" WHERE vector_feature_id = ?`,
            )
            .get(vectorFeature._id);
          if (vecRow != null) {
            db.run(`DELETE FROM "${escaped}" WHERE vector_feature_id = ?`, [vectorFeature._id]);
            db.run(
              `INSERT INTO "${escaped}" (vector_feature_id, memory_id, embedding) VALUES (?, ?, ?)`,
              [newVectorFeatureId, newMemoryId, vecRow.embedding],
            );
          }
        }

        db.run(
          `INSERT INTO vector_features (_id, _ts_created, memory_id, source_map_id, vector) VALUES (?, ?, ?, ?, ?)`,
          [
            newVectorFeatureId,
            vectorFeature._ts_created,
            newMemoryId,
            newSourceMapId,
            vectorFeature.vector,
          ],
        );
        db.run(`DELETE FROM vector_features WHERE _id = ?`, [vectorFeature._id]);
      }

      db.run(`DELETE FROM source_maps WHERE _id = ?`, [sourceMap._id]);
    }

    const memoryScopes = db
      .query<{ _id: string; _ts_created: number; scope_id: string }, [string]>(
        `SELECT _id, _ts_created, scope_id FROM memory_scopes WHERE memory_id = ?`,
      )
      .all(oldMemoryId);

    for (const memoryScope of memoryScopes) {
      const scopeId = scopeIdMap.get(memoryScope.scope_id) ?? memoryScope.scope_id;
      const newMemoryScopeId = stableId("ms", newMemoryId, scopeId);
      db.run(
        `INSERT OR REPLACE INTO memory_scopes (_id, _ts_created, memory_id, scope_id) VALUES (?, ?, ?, ?)`,
        [newMemoryScopeId, memoryScope._ts_created, newMemoryId, scopeId],
      );
      if (newMemoryScopeId !== memoryScope._id) {
        db.run(`DELETE FROM memory_scopes WHERE _id = ?`, [memoryScope._id]);
      }
    }

    db.run(`DELETE FROM memories WHERE _id = ?`, [oldMemoryId]);
    migratedCount += 1;
  }

  return migratedCount;
}

/** Rewrite legacy principal path segments and memory ids inside one memories database. */
export function migrateLegacyMemoriesDatabase(
  db: Database,
  segmentMap: ReadonlyMap<string, string>,
): boolean {
  if (segmentMap.size === 0) return false;

  const hasLegacyScopes = db
    .query<{ _id: string }, []>(`SELECT _id FROM scopes`)
    .all()
    .some(({ _id }) => migrateNamespacePathWithSegmentMap(_id, segmentMap) !== _id);
  const hasLegacyNamespaces = db
    .query<{ namespace: string }, []>(`SELECT namespace FROM memories`)
    .all()
    .some(
      ({ namespace }) => migrateNamespacePathWithSegmentMap(namespace, segmentMap) !== namespace,
    );

  if (!hasLegacyScopes && !hasLegacyNamespaces) return false;

  db.run("PRAGMA foreign_keys = OFF");
  try {
    db.run("BEGIN IMMEDIATE");
    const scopeIdMap = migrateScopePaths(db, segmentMap);
    const migratedMemories = migrateMemoryRows(db, scopeIdMap, segmentMap);
    rebuildScopeClosure(db, Date.now());
    db.run("COMMIT");
    return scopeIdMap.size > 0 || migratedMemories > 0;
  } catch (err) {
    try {
      db.run("ROLLBACK");
    } catch {
      // ignore nested rollback failures
    }
    throw err;
  } finally {
    db.run("PRAGMA foreign_keys = ON");
  }
}
