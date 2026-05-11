import type { Database } from "bun:sqlite";
import { ensureSwarmHostSqliteSchema } from "./schema.ts";

export type ProbeSubscriberRow = {
  probePostId: string;
  ownerProfileId: string;
  embeddingF32: Float32Array | null;
  minHitScore: number | null;
  topicSlugs: string[] | null;
  matchPostKinds: string[] | null;
  expiresAtMs: number | null;
};

export type ProbeSubscriberUpsert = Omit<ProbeSubscriberRow, "embeddingF32"> & {
  embeddingF32: Float32Array | null;
};

function float32ToBlob(vec: Float32Array): Uint8Array {
  return new Uint8Array(vec.buffer, vec.byteOffset, vec.byteLength);
}

function blobToFloat32(blob: Uint8Array): Float32Array {
  const copy = new Uint8Array(blob);
  return new Float32Array(copy.buffer, copy.byteOffset, copy.byteLength / 4);
}

export function upsertProbeSubscriber(db: Database, row: ProbeSubscriberUpsert): void {
  ensureSwarmHostSqliteSchema(db);
  db.run(
    `INSERT INTO probe_subscribers (
       probe_post_id, owner_profile_id, embedding_blob,
       min_hit_score, topic_slugs, match_post_kinds, expires_at_ms, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(probe_post_id) DO UPDATE SET
       owner_profile_id = excluded.owner_profile_id,
       embedding_blob = excluded.embedding_blob,
       min_hit_score = excluded.min_hit_score,
       topic_slugs = excluded.topic_slugs,
       match_post_kinds = excluded.match_post_kinds,
       expires_at_ms = excluded.expires_at_ms,
       updated_at = excluded.updated_at`,
    [
      row.probePostId,
      row.ownerProfileId,
      row.embeddingF32 !== null ? float32ToBlob(row.embeddingF32) : null,
      row.minHitScore,
      row.topicSlugs !== null ? JSON.stringify(row.topicSlugs) : null,
      row.matchPostKinds !== null ? JSON.stringify(row.matchPostKinds) : null,
      row.expiresAtMs,
      Date.now(),
    ],
  );
}

export function deleteProbeSubscriber(db: Database, probePostId: string): void {
  ensureSwarmHostSqliteSchema(db);
  db.run(`DELETE FROM probe_subscribers WHERE probe_post_id = ?`, [probePostId]);
}

type RawRow = {
  probe_post_id: string;
  owner_profile_id: string;
  embedding_blob: Uint8Array | null;
  min_hit_score: number | null;
  topic_slugs: string | null;
  match_post_kinds: string | null;
  expires_at_ms: number | null;
};

function parseJsonStringArray(raw: string | null): string[] | null {
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const out: string[] = [];
    for (const v of parsed) {
      if (typeof v === "string") out.push(v);
    }
    return out;
  } catch {
    return null;
  }
}

/** Returns probe subscribers whose `expires_at_ms` is null or strictly greater than `nowMs`. */
export function listActiveProbeSubscribers(db: Database, nowMs: number): ProbeSubscriberRow[] {
  ensureSwarmHostSqliteSchema(db);
  const rows = db
    .query<
      RawRow,
      [number]
    >(
      `SELECT probe_post_id, owner_profile_id, embedding_blob,
              min_hit_score, topic_slugs, match_post_kinds, expires_at_ms
       FROM probe_subscribers
       WHERE expires_at_ms IS NULL OR expires_at_ms > ?`,
    )
    .all(nowMs);
  return rows.map((r) => ({
    probePostId: r.probe_post_id,
    ownerProfileId: r.owner_profile_id,
    embeddingF32: r.embedding_blob !== null ? blobToFloat32(r.embedding_blob) : null,
    minHitScore: r.min_hit_score,
    topicSlugs: parseJsonStringArray(r.topic_slugs),
    matchPostKinds: parseJsonStringArray(r.match_post_kinds),
    expiresAtMs: r.expires_at_ms,
  }));
}
