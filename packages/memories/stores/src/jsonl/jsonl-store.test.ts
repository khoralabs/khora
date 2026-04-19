import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SourceMap } from "@cfd/memories-core";
import { JsonlStore } from "./jsonl-store";

function sm(memory_id: string, source_key: string): SourceMap {
  return { memory_id, source_key } as SourceMap;
}

describe("JsonlStore", () => {
  test("resolve returns string payload for matching source map", async () => {
    const dir = mkdtempSync(join(tmpdir(), "jsonl-store-"));
    const path = join(dir, "store.jsonl");
    writeFileSync(
      path,
      `${JSON.stringify({
        memory_id: "m1",
        source_key: "chunk",
        kind: "string",
        string: "hello",
      })}\n`,
      "utf8",
    );
    const store = new JsonlStore(path);
    await expect(store.resolve(sm("m1", "chunk"))).resolves.toEqual({
      kind: "string",
      string: "hello",
    });
  });

  test("appendStringEntry updates resolve", async () => {
    const dir = mkdtempSync(join(tmpdir(), "jsonl-store-"));
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "s.jsonl");
    const store = new JsonlStore(path);
    store.appendStringEntry("mid", "sk", "text");
    await expect(store.resolve(sm("mid", "sk"))).resolves.toEqual({
      kind: "string",
      string: "text",
    });
  });
});
