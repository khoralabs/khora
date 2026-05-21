import { appendFileSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname } from "node:path";
import type { ResolvedSourceMapLine, SourceMap, Store } from "@khoralabs/memories-core";
import type { TextFeatureExportRow } from "@khoralabs/memories-core/persistence";
import type { DefaultEntityMap, ResolvedSource } from "@khoralabs/sourcemaps";

function storeKey(memoryId: string, sourceKey: string): string {
  return `${memoryId}\n${sourceKey}`;
}

function lineToResolved(line: ResolvedSourceMapLine): ResolvedSource<DefaultEntityMap> {
  if (line.kind === "json" && typeof line.body === "string") {
    return { kind: "json", body: line.body };
  }
  if (
    line.kind === "record" &&
    typeof line.domain === "string" &&
    typeof line.entity_id === "string" &&
    typeof line.json === "string"
  ) {
    return {
      kind: "record",
      domain: line.domain,
      entity_id: line.entity_id,
      value: JSON.parse(line.json) as unknown,
    };
  }
  if (line.kind === "string") {
    return { kind: "string", string: line.string };
  }
  if (line.kind === "url") {
    return { kind: "url", url: line.url };
  }
  if (line.kind === "blob" && typeof line.blob === "string") {
    const bin = Buffer.from(line.blob, "base64");
    return {
      kind: "blob",
      blob: new Blob([bin], { type: line.mime_type ?? "application/octet-stream" }),
    };
  }
  throw new Error(
    `JsonlStore: unsupported ResolvedSourceMapLine kind ${String((line as { kind?: string }).kind)}`,
  );
}

function parseLine(raw: string): ResolvedSourceMapLine | undefined {
  const t = raw.trim();
  if (!t || t.startsWith("#")) return undefined;
  const o = JSON.parse(t) as ResolvedSourceMapLine;
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
  if (o.kind === "json" && typeof o.body === "string") return o;
  if (
    o.kind === "record" &&
    typeof o.domain === "string" &&
    typeof o.entity_id === "string" &&
    typeof o.json === "string"
  ) {
    return o;
  }
  return undefined;
}

function stringLine(memoryId: string, sourceKey: string, text: string): ResolvedSourceMapLine {
  return { memory_id: memoryId, source_key: sourceKey, kind: "string", string: text };
}

/**
 * File-backed {@link Store} for tests and CLIs: one JSON object per line (JSONL).
 * Later lines override earlier lines for the same `(memory_id, source_key)`.
 */
export class JsonlStore implements Store<DefaultEntityMap> {
  private readonly byKey = new Map<string, ResolvedSource<DefaultEntityMap>>();

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

  resolve(sourcemap: SourceMap): Promise<ResolvedSource<DefaultEntityMap>> {
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

  /** Append rows from {@link TextFeatureExportRow} (e.g. from persistence `listTextFeatureExportRowsForMemory`). */
  syncFromTextExportRows(rows: readonly TextFeatureExportRow[]): void {
    for (const row of rows) {
      this.appendStringEntry(row.memory_id, row.source_key, row.text);
    }
  }
}
