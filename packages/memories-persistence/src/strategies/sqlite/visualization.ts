import type { Database } from "bun:sqlite";
import type { MemoriesVisualization as IMemoriesVisualization } from "@cfd/memories-core";
import { loadEdgePreview } from "./visualization/edge-preview";
import { loadMemoryTextPreview } from "./visualization/memory-preview";
import {
  loadGraphEdgesForNamespace,
  loadMeanEmbeddingsForNamespace,
  loadNodeLabelsForNamespace,
} from "./visualization/projection";

export class MemoriesVisualization implements IMemoriesVisualization {
  constructor(private readonly db: Database) {}

  loadGraphEdgesForNamespace(namespace: string) {
    return loadGraphEdgesForNamespace(this.db, namespace);
  }

  loadNodeLabelsForNamespace(namespace: string) {
    return loadNodeLabelsForNamespace(this.db, namespace);
  }

  loadMeanEmbeddingsForNamespace(namespace: string) {
    return loadMeanEmbeddingsForNamespace(this.db, namespace);
  }

  loadMemoryTextPreview(namespace: string, key: string, maxChars?: number) {
    return loadMemoryTextPreview(this.db, namespace, key, maxChars);
  }

  loadEdgePreview(namespace: string, edgeId: string) {
    return loadEdgePreview(this.db, namespace, edgeId);
  }
}

export function createMemoriesVisualization(db: Database): MemoriesVisualization {
  return new MemoriesVisualization(db);
}
