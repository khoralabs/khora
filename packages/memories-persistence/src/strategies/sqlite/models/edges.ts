import { ids } from "@cfd/memories";
import { documentValidator, jsonOrNull } from "../_lib";
import { schema } from "../schema";
import type { DbCtx } from "./context";

export function insertEdge(
  ctx: DbCtx,
  input: {
    fromNodeId: string;
    toNodeId: string;
    properties?: Record<string, unknown>;
    /** Disambiguates stable id (e.g. this memory’s key + other memory key). */
    idParts: { selfMemoryKey: string; otherMemoryKey: string; label: string };
  },
): { edgeId: string } {
  const { db, now } = ctx;
  const edgeId = ids.edge(
    input.fromNodeId,
    input.toNodeId,
    input.idParts.label,
    input.idParts.selfMemoryKey,
    input.idParts.otherMemoryKey,
  );
  const doc = documentValidator(schema, "edges");
  doc.parse({
    _id: edgeId,
    _ts_created: now,
    from_node_id: input.fromNodeId,
    to_node_id: input.toNodeId,
    properties: input.properties,
  });
  db.run(
    `INSERT INTO edges (_id, _ts_created, from_node_id, to_node_id, properties) VALUES (?, ?, ?, ?, ?)`,
    [edgeId, now, input.fromNodeId, input.toNodeId, jsonOrNull(input.properties)],
  );
  return { edgeId };
}
