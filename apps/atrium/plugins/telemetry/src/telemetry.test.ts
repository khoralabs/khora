import { describe, expect, mock, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AtriumClientEvent } from "@khoralabs/atrium-client";
import { createTelemetryArchive } from "./index.ts";

describe("createTelemetryArchive", () => {
  test("rotates when byte budget exceeded", () => {
    const dir = mkdtempSync(join(tmpdir(), "atrium-tel-"));
    let listener: ((e: AtriumClientEvent) => void) | undefined;
    const client = {
      subscribe: (fn: (e: AtriumClientEvent) => void) => {
        listener = fn;
        return () => {
          listener = undefined;
        };
      },
    };
    const archive = createTelemetryArchive({
      client,
      dir,
      maxFileBytes: 120,
    });
    const ev = (n: number): AtriumClientEvent => ({
      type: "topic:subscribed",
      did: "did:key:a",
      topicSlug: `topic-${n}`,
    });
    listener?.(ev(1));
    listener?.(ev(2));
    archive.close();
    const files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
    expect(files.length).toBeGreaterThanOrEqual(1);
    const totalLines = files.reduce((acc, f) => {
      const lines = readFileSync(join(dir, f), "utf8").trim().split("\n").filter(Boolean);
      return acc + lines.length;
    }, 0);
    expect(totalLines).toBe(2);
    rmSync(dir, { recursive: true });
  });

  test("close unsubscribes", () => {
    const dir = mkdtempSync(join(tmpdir(), "atrium-tel-"));
    const unsub = mock(() => {});
    const client = {
      subscribe: mock(() => unsub),
    };
    const archive = createTelemetryArchive({ client, dir, maxFileBytes: 1_000_000 });
    archive.close();
    expect(client.subscribe).toHaveBeenCalled();
    expect(unsub).toHaveBeenCalled();
    rmSync(dir, { recursive: true });
  });
});
