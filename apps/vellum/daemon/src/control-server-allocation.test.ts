import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { ChainInitWireSchema, DEFAULT_GENESIS_TURN_WIRE } from "@khoralabs/vellum-contracts";

import { startVellumControlServer } from "./control-server";
import { ensureVellumMetaSchema } from "./vellum-sqlite-meta";

test("chain/init rejects without relay allocation when check enabled", async () => {
  const db = new Database(":memory:");
  ensureVellumMetaSchema(db);
  const allocated = new Set<string>();

  const server = startVellumControlServer({
    state: { conn: undefined, handles: new Map() },
    db,
    isChainAllocated: (sessionId) => allocated.has(sessionId),
  });

  const sampleInit = ChainInitWireSchema.parse({
    session_id: "unallocated",
    genesis_hash: "aa".repeat(32),
    party_ids: ["a", "b"],
    actor_pubkeys: ["bb".repeat(32), "cc".repeat(32)],
  });

  const res = await fetch(`http://${server.hostname}:${server.port}/chain/init`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      init: sampleInit,
      genesis_turn: DEFAULT_GENESIS_TURN_WIRE,
    }),
  });
  expect(res.status).toBe(409);
  server.stop();
  db.close();
});
