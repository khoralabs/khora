import type { Database } from "bun:sqlite";
import type { MemoriesVisualizationPersistence } from "@cfd/memories";
import { loadEdgePreviewSqlite } from "./edge-preview-sqlite";
import { loadMemoryTextPreviewSqlite } from "./memory-preview-sqlite";
import {
  loadGraphEdgesForNamespaceSqlite,
  loadMeanEmbeddingsForNamespaceSqlite,
  loadNodeLabelsForNamespaceSqlite,
} from "./projection-sqlite";

export class SqliteMemoriesVisualizationPersistence implements MemoriesVisualizationPersistence {
  constructor(private readonly db: Database) {}

  loadGraphEdgesForNamespace(namespace: string) {
    return loadGraphEdgesForNamespaceSqlite(this.db, namespace);
  }

  loadNodeLabelsForNamespace(namespace: string) {
    return loadNodeLabelsForNamespaceSqlite(this.db, namespace);
  }

  loadMeanEmbeddingsForNamespace(namespace: string) {
    return loadMeanEmbeddingsForNamespaceSqlite(this.db, namespace);
  }

  loadMemoryTextPreview(namespace: string, key: string, maxChars?: number) {
    return loadMemoryTextPreviewSqlite(this.db, namespace, key, maxChars);
  }

  loadEdgePreview(namespace: string, edgeId: string) {
    return loadEdgePreviewSqlite(this.db, namespace, edgeId);
  }
}

export function createSqliteMemoriesVisualizationPersistence(
  db: Database,
): MemoriesVisualizationPersistence {
  return new SqliteMemoriesVisualizationPersistence(db);
}
