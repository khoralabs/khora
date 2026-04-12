import type { UMAPParameters } from "umap-js";
import type { MemoriesVisualizationRuntimeCtx } from "../persistence/types";
import {
  loadGraphEdgesForNamespace,
  loadMeanEmbeddingsForNamespace,
  loadNodeLabelsForNamespace,
} from "./graph-projection";
import {
  fibonacciSphereLayout3D,
  minMaxNormalize3D,
  type Point3,
  umap3DLayout,
} from "./umap-layout";

export type GraphLayoutNode = {
  key: string;
  x: number;
  y: number;
  z: number;
  labels: string[];
};

export type GraphLayoutEdge = {
  edgeId: string;
  fromKey: string;
  toKey: string;
  labels: string[];
  directed?: boolean;
};

export type NamespaceGraphLayout = {
  namespace: string;
  nodes: GraphLayoutNode[];
  edges: GraphLayoutEdge[];
};

/**
 * Loads edges + mean embeddings, runs UMAP 3D (or fallback), returns normalized [-1,1]³ positions.
 */
export function buildNamespaceGraphLayout(
  ctx: MemoriesVisualizationRuntimeCtx,
  namespace: string,
  _umapOptions?: Partial<UMAPParameters>,
): NamespaceGraphLayout {
  const edges = loadGraphEdgesForNamespace(ctx, namespace);
  const withEmb = loadMeanEmbeddingsForNamespace(ctx, namespace);
  const labelsByKey = loadNodeLabelsForNamespace(ctx, namespace);

  const keySet = new Set<string>();
  for (const e of edges) {
    keySet.add(e.fromKey);
    keySet.add(e.toKey);
  }
  for (const n of withEmb) {
    keySet.add(n.memoryKey);
  }

  const orderedKeys = [...keySet].sort();
  const embByKey = new Map(withEmb.map((e) => [e.memoryKey, e.embedding] as const));

  const rawPositions: Point3[] = [];

  if (orderedKeys.length === 0) {
    return {
      namespace,
      nodes: [],
      edges: edges.map((e) => ({
        edgeId: e.edgeId,
        fromKey: e.fromKey,
        toKey: e.toKey,
        labels: e.labels,
        directed: e.directed,
      })),
    };
  }

  if (withEmb.length === 0) {
    rawPositions.push(...fibonacciSphereLayout3D(orderedKeys.length));
  } else {
    const embKeys = orderedKeys.filter((k) => embByKey.has(k));
    const noEmbKeys = orderedKeys.filter((k) => !embByKey.has(k));
    const embeddingRows: number[][] = [];
    for (const k of embKeys) {
      const row = embByKey.get(k);
      if (row) embeddingRows.push(row);
    }
    const umapPart = umap3DLayout(embeddingRows);
    const fbPart = noEmbKeys.length > 0 ? fibonacciSphereLayout3D(noEmbKeys.length) : [];

    const posByKey = new Map<string, Point3>();
    for (let i = 0; i < embKeys.length; i++) {
      const k = embKeys[i];
      const p = umapPart[i];
      if (k !== undefined && p !== undefined) posByKey.set(k, p);
    }
    for (let i = 0; i < noEmbKeys.length; i++) {
      const k = noEmbKeys[i];
      const p = fbPart[i];
      if (k !== undefined && p !== undefined) posByKey.set(k, p);
    }

    for (const k of orderedKeys) {
      rawPositions.push(posByKey.get(k) ?? { x: 0, y: 0, z: 0 });
    }
  }

  const normalized = minMaxNormalize3D(rawPositions);
  const nodes: GraphLayoutNode[] = orderedKeys.map((key, i) => {
    const p = normalized[i];
    const labels = labelsByKey.get(key) ?? [];
    if (!p) return { key, x: 0, y: 0, z: 0, labels };
    return { key, x: p.x, y: p.y, z: p.z, labels };
  });

  const edgeRows: GraphLayoutEdge[] = edges.map((e) => ({
    edgeId: e.edgeId,
    fromKey: e.fromKey,
    toKey: e.toKey,
    labels: e.labels,
    directed: e.directed,
  }));

  return {
    namespace,
    nodes,
    edges: edgeRows,
  };
}
