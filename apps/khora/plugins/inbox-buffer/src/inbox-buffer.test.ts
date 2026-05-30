import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AgentSigner } from "@khoralabs/khora-auth";
import { KhoraClient } from "@khoralabs/khora-client";

import { createInboxBufferPlugin } from "./index";

function testSigner(): AgentSigner {
  return { did: "did:key:buf", sign: async () => new Uint8Array(64) };
}

describe("createInboxBufferPlugin", () => {
  test("creates inbox_events table on install", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "khora-inbox-buf-"));
    const dbPath = path.join(dir, "inbox.sqlite");
    const client = new KhoraClient({
      baseUrl: "http://127.0.0.1:1",
      signer: testSigner(),
      dataDir: dir,
      plugins: [
        createInboxBufferPlugin({
          dbPath: "inbox.sqlite",
          compactPolicy: { maxEntries: 100 },
        }),
      ],
    });
    const db = new Database(dbPath);
    const tables = db
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name='inbox_events'")
      .all() as { name: string }[];
    expect(tables.length).toBe(1);
    client.dispose();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
