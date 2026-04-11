import { createHash } from "node:crypto";

function stableId(prefix: string, ...parts: string[]): string {
  const h = createHash("sha256")
    .update([prefix, ...parts].join("\0"))
    .digest("hex");
  return `${prefix}_${h.slice(0, 24)}`;
}

/** Deterministic primary keys for merge / upsert flows. */
export const ids = {
  memory: (namespace: string, key: string) => stableId("mem", namespace, key),
  node: (namespace: string, key: string) => stableId("node", namespace, key),
  sourceMap: (memoryId: string, sourceKey: string) => stableId("sm", memoryId, sourceKey),
  textFeature: (sourceMapId: string) => stableId("tf", sourceMapId),
  vectorFeature: (sourceMapId: string) => stableId("vf", sourceMapId),
  nodeLabel: (value: string) => stableId("nl", value),
  edgeLabel: (value: string) => stableId("el", value),
  nodeLabelAssignment: (nodeId: string, labelId: string) => stableId("nla", nodeId, labelId),
  edge: (
    fromNodeId: string,
    toNodeId: string,
    label: string,
    selfKey: string,
    otherMemoryKey: string,
  ) => stableId("edge", fromNodeId, toNodeId, label, selfKey, otherMemoryKey),
  edgeLabelAssignment: (edgeId: string, labelId: string) => stableId("ela", edgeId, labelId),
} as const;
