import type { Database } from "bun:sqlite";
import type { AtriumPost } from "@cfd/atrium-contracts";
import { zAtriumPost } from "@cfd/atrium-contracts";
import type { SwarmHostEntityRow } from "@cfd/swarm-host";
import { ensureSwarmHostSqliteSchema } from "./schema.ts";

/** Post rows for `kind` + author `profileId`, newest `updated_at` first (bounded). */
export function listPostRowsByAuthorProfileIdAndKind(
  db: Database,
  authorProfileId: string,
  kind: string,
  limit: number,
): SwarmHostEntityRow[] {
  ensureSwarmHostSqliteSchema(db);
  const cap = Math.max(0, Math.min(limit, 500));
  if (cap === 0) return [];
  const rows = db
    .query<
      {
        id: string;
        memory_id: string | null;
        body_json: string;
        updated_at: number;
      },
      [string, string, number]
    >(
      `SELECT id, memory_id, body_json, updated_at FROM host_entities
       WHERE kind = 'post'
         AND json_extract(body_json, '$.kind') = ?
         AND json_extract(body_json, '$.authorProfileId') = ?
       ORDER BY updated_at DESC
       LIMIT ?`,
    )
    .all(kind, authorProfileId, cap) as {
    id: string;
    memory_id: string | null;
    body_json: string;
    updated_at: number;
  }[];
  return rows.map((r) => ({
    id: r.id,
    memoryId: r.memory_id,
    bodyJson: r.body_json,
    updatedAtMs: r.updated_at,
  }));
}

/** Probe posts authored by `profileId`, newest `updated_at` first (bounded). */
export function listProbePostsForProfileId(
  db: Database,
  profileId: string,
  limit: number,
): AtriumPost[] {
  const rows = listPostRowsByAuthorProfileIdAndKind(db, profileId, "probe", limit);
  const out: AtriumPost[] = [];
  for (const r of rows) {
    try {
      out.push(zAtriumPost.parse(JSON.parse(r.bodyJson)));
    } catch {
      /* skip corrupt rows */
    }
  }
  return out;
}
