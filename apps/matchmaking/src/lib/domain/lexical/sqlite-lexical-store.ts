import type { Database } from "bun:sqlite";
import type {
  DefaultEntityMap,
  ResolvedSource,
  ResolvedSourceMapLine,
  SourceMap,
  Store,
} from "@khoralabs/memories-core";
import type { TextFeatureExportRow } from "@khoralabs/memories-core/persistence";

function storeKey(memoryId: string, sourceKey: string): string {
  return `${memoryId}\n${sourceKey}`;
}

function lineToResolved(line: ResolvedSourceMapLine): ResolvedSource {
  if (line.kind === "json" && typeof line.body === "string") {
    return { kind: "json", body: line.body };
  }
  if (
    line.kind === "record" &&
    typeof line.domain === "string" &&
    typeof line.entityId === "string" &&
    typeof line.json === "string"
  ) {
    return {
      kind: "record",
      domain: line.domain,
      entityId: line.entityId,
      value: JSON.parse(line.json) as unknown,
    };
  }
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

function parseLineJson(raw: string): ResolvedSourceMapLine | undefined {
  const t = raw.trim();
  if (t.length === 0) {
    return undefined;
  }
  const o = JSON.parse(t) as ResolvedSourceMapLine;
  if (
    !o ||
    typeof o !== "object" ||
    typeof o.memory_id !== "string" ||
    typeof o.source_key !== "string"
  ) {
    return undefined;
  }
  if (o.kind === "string" && typeof o.string === "string") {
    return o;
  }
  if (o.kind === "url" && typeof o.url === "string") {
    return o;
  }
  if (o.kind === "blob" && typeof o.blob === "string") {
    return o;
  }
  if (o.kind === "json" && typeof o.body === "string") {
    return o;
  }
  if (
    o.kind === "record" &&
    typeof o.domain === "string" &&
    typeof o.entityId === "string" &&
    typeof o.json === "string"
  ) {
    return o;
  }
  return undefined;
}

/**
 * {@link Store} for KG lexical mirror: one instance per memory namespace, backed by
 * `lexical_lines` in the matchmaking domain database.
 */
export class SqliteLexicalStore implements Store<DefaultEntityMap> {
  private readonly byKey = new Map<string, ResolvedSource<DefaultEntityMap>>();
  private readonly namespace: string;

  constructor(
    private readonly db: Database,
    namespace: string,
  ) {
    this.namespace = namespace;
    this.warmFromDb();
  }

  private warmFromDb(): void {
    const rows = this.db
      .query("SELECT line_json FROM lexical_lines WHERE namespace = ?")
      .all(this.namespace) as { line_json: string }[];
    for (const r of rows) {
      const line = parseLineJson(r.line_json);
      if (line === undefined) {
        continue;
      }
      this.byKey.set(storeKey(line.memory_id, line.source_key), lineToResolved(line));
    }
  }

  resolve(sourcemap: SourceMap): Promise<ResolvedSource<DefaultEntityMap>> {
    const key = storeKey(sourcemap.memory_id, sourcemap.source_key);
    const hit = this.byKey.get(key);
    if (hit === undefined) {
      return Promise.reject(
        new Error(
          `SqliteLexicalStore: no entry for memory_id=${sourcemap.memory_id} source_key=${sourcemap.source_key}`,
        ),
      );
    }
    return Promise.resolve(hit);
  }

  syncFromTextExportRows(rows: readonly TextFeatureExportRow[]): void {
    const ins = this.db.query(
      `INSERT OR REPLACE INTO lexical_lines (namespace, memory_id, source_key, line_json)
       VALUES (?, ?, ?, ?)`,
    );
    for (const row of rows) {
      const line: ResolvedSourceMapLine = {
        memory_id: row.memory_id,
        source_key: row.source_key,
        kind: "string",
        string: row.text,
      };
      const lineJson = JSON.stringify(line);
      ins.run(this.namespace, row.memory_id, row.source_key, lineJson);
      this.byKey.set(storeKey(row.memory_id, row.source_key), { kind: "string", string: row.text });
    }
  }
}
