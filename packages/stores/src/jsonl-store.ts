import type { Database } from "bun:sqlite";
import { appendFileSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname } from "node:path";
import type { ResolvedSource, SourceMap, Store } from "@cfd/memories";

export type JsonlResolvedLine =
  | {
      memory_id: string;
      source_key: string;
      kind: "string";
      string: string;
    }
  | {
      memory_id: string;
      source_key: string;
      kind: "url";
      url: string;
    }
  | {
      memory_id: string;
      source_key: string;
      kind: "blob";
      /** Base64-encoded bytes */
      blob: string;
      mimeType?: string;
    };

function storeKey(memoryId: string, sourceKey: string): string {
  return `${memoryId}\n${sourceKey}`;
}

function lineToResolved(line: JsonlResolvedLine): ResolvedSource {
  if (line.kind === "string") {
    return { kind: "string", string: line.string };
  }
  if (line.kind === "url") {
    return { kind: "url", url: line.url };
  }
  const bin = Buffer.from(line.blob, "base64");
  return {
    kind: "blob",
    blob: new Blob([bin], { type: line.mimeType ?? "application/octet-stream" }),
  };
}

function parseLine(raw: string): JsonlResolvedLine | undefined {
  const t = raw.trim();
  if (!t || t.startsWith("#")) return undefined;
  const o = JSON.parse(t) as JsonlResolvedLine;
  if (
    !o ||
    typeof o !== "object" ||
    typeof o.memory_id !== "string" ||
    typeof o.source_key !== "string"
  ) {
    return undefined;
  }
  if (o.kind === "string" && typeof o.string === "string") return o;
  if (o.kind === "url" && typeof o.url === "string") return o;
  if (o.kind === "blob" && typeof o.blob === "string") return o;
  return undefined;
}

function stringLine(memoryId: string, sourceKey: string, text: string): JsonlResolvedLine {
  return { memory_id: memoryId, source_key: sourceKey, kind: "string", string: text };
}

/**
 * File-backed {@link Store} for tests and CLIs: one JSON object per line (JSONL).
 * Later lines override earlier lines for the same `(memory_id, source_key)`.
 */
export class JsonlStore implements Store {
  private readonly byKey = new Map<string, ResolvedSource>();

  constructor(readonly path: string) {
    this.reload();
  }

  /** Re-read the file from disk (e.g. after another process wrote to it). */
  reload(): void {
    this.byKey.clear();
    try {
      if (!statSync(this.path).size) return;
    } catch {
      return;
    }
    const text = readFileSync(this.path, "utf8");
    for (const line of text.split("\n")) {
      const parsed = parseLine(line);
      if (!parsed) continue;
      this.byKey.set(storeKey(parsed.memory_id, parsed.source_key), lineToResolved(parsed));
    }
  }

  resolve(sourcemap: SourceMap): Promise<ResolvedSource> {
    const key = storeKey(sourcemap.memory_id, sourcemap.source_key);
    const hit = this.byKey.get(key);
    if (!hit) {
      return Promise.reject(
        new Error(
          `JsonlStore: no entry for memory_id=${sourcemap.memory_id} source_key=${sourcemap.source_key}`,
        ),
      );
    }
    return Promise.resolve(hit);
  }

  /**
   * Append one JSONL line and update the in-memory map (last write wins for that key).
   * Ensures parent directory exists.
   */
  appendStringEntry(memoryId: string, sourceKey: string, text: string): void {
    const line = stringLine(memoryId, sourceKey, text);
    const payload = `${JSON.stringify(line)}\n`;
    try {
      mkdirSync(dirname(this.path), { recursive: true });
    } catch {
      /* exists */
    }
    appendFileSync(this.path, payload, "utf8");
    this.byKey.set(storeKey(memoryId, sourceKey), { kind: "string", string: text });
  }

  /** Write string entries for all text features attached to `memory_id` (for prefetch resolve). */
  syncFromMemoryDatabase(db: Database, memoryId: string): void {
    const rows = db
      .prepare(
        `SELECT sm.memory_id AS memory_id, sm.source_key AS source_key, tf.text AS text
         FROM text_features tf
         INNER JOIN source_maps sm ON tf.source_map_id = sm._id
         WHERE sm.memory_id = ?`,
      )
      .all(memoryId) as Array<{ memory_id: string; source_key: string; text: string }>;
    for (const row of rows) {
      this.appendStringEntry(row.memory_id, row.source_key, row.text);
    }
  }
}

/** Look up `memories._id` by namespace + logical key. */
export function getMemoryIdByNamespaceKey(
  db: Database,
  namespace: string,
  key: string,
): string | undefined {
  const row = db
    .prepare(`SELECT _id FROM memories WHERE namespace = ? AND key = ?`)
    .get(namespace, key) as { _id: string } | undefined;
  return row?._id;
}
