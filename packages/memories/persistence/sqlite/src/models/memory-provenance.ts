import type { Database } from "bun:sqlite";
import { ids } from "@cfd/memories-core";
import { memoriesPersistenceDocumentSchema } from "@cfd/memories-core/persistence";
import {
  canonicalJson,
  type MemoryProvenanceEvent,
  nextProvenanceRoot,
} from "@cfd/memories-core/provenance";
import { documentValidator } from "../_lib";
import type { DbCtx } from "./context";

const doc = documentValidator(memoriesPersistenceDocumentSchema, "memory_provenance");

export function getProvenanceHeadRootHex(db: Database): string | undefined {
  const row = db
    .query<{ root_hex: string }, []>(
      // Tie-break with rowid: `_id` sort order is unrelated to chain order; same-ms merges must see latest link.
      `SELECT root_hex FROM memory_provenance ORDER BY _ts_created DESC, rowid DESC LIMIT 1`,
    )
    .get();
  return row?.root_hex;
}

export function appendProvenanceEvent(ctx: DbCtx, event: MemoryProvenanceEvent): void {
  const { db, now } = ctx;
  const head = getProvenanceHeadRootHex(db);
  const { parent_root_hex, root_hex } = nextProvenanceRoot(head, event);
  const eventJson = canonicalJson(event);
  const event_type = event.kind;
  const rowId = ids.provenance(parent_root_hex, eventJson);
  doc.parse({
    _id: rowId,
    _ts_created: now,
    parent_root_hex,
    root_hex,
    event_type,
    event_json: eventJson,
  });
  db.run(
    `INSERT INTO memory_provenance (_id, _ts_created, parent_root_hex, root_hex, event_type, event_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [rowId, now, parent_root_hex, root_hex, event_type, eventJson],
  );
}
