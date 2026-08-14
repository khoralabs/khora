import { type StandingQuery, zStandingSearchRequest } from "..";

export type QueryRow = {
  id: string;
  owner_id: string;
  search_json: string;
  min_score: number;
  active: number;
  created_at_ms: number;
  updated_at_ms: number;
  expires_at_ms: number | null;
};

export type SemanticQueryRow = QueryRow & { vector: Uint8Array | Buffer | null };

export function encodeVector(vec: readonly number[]): Uint8Array {
  const f32 = new Float32Array(vec);
  return new Uint8Array(f32.buffer);
}

export function decodeVector(blob: Uint8Array | Buffer): number[] {
  const bytes =
    blob instanceof Buffer ? new Uint8Array(blob.buffer, blob.byteOffset, blob.byteLength) : blob;
  const f32 = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  return Array.from(f32);
}

export function searchToJson(query: StandingQuery): string {
  const { vector: _vec, ...restContent } = query.search.content;
  return JSON.stringify({ ...query.search, content: restContent });
}

export function rowToFilterQuery(row: QueryRow): StandingQuery {
  const search = zStandingSearchRequest.parse(JSON.parse(row.search_json));
  return {
    id: row.id,
    ownerId: row.owner_id,
    search,
    minScore: row.min_score,
    active: row.active !== 0,
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms,
    ...(row.expires_at_ms !== null ? { expiresAtMs: row.expires_at_ms } : {}),
  };
}

export function rowToSemanticQuery(row: SemanticQueryRow): StandingQuery {
  const search = zStandingSearchRequest.parse(JSON.parse(row.search_json));
  if (row.vector !== null && row.vector.byteLength > 0) {
    search.content.vector = decodeVector(row.vector);
  }
  return {
    id: row.id,
    ownerId: row.owner_id,
    search,
    minScore: row.min_score,
    active: row.active !== 0,
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms,
    ...(row.expires_at_ms !== null ? { expiresAtMs: row.expires_at_ms } : {}),
  };
}

export const FILTER_COLS =
  "id, owner_id, search_json, min_score, active, created_at_ms, updated_at_ms, expires_at_ms";
export const SEMANTIC_COLS =
  "id, owner_id, search_json, vector, min_score, active, created_at_ms, updated_at_ms, expires_at_ms";
