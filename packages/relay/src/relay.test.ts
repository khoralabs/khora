import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateRoomSecretHex, signRoomTicket, verifyRoomTicket } from "@cfd/frame-channel";
import { openMemoriesDatabase } from "@cfd/memories-sqlite";
import { createRelayCardStore } from "./card-store.ts";
import { createRelayFrameQueue } from "./frame-queue.ts";
import { createRelayRoomHub } from "./room.ts";
import { ensureRelaySchema } from "./schema.ts";

describe("relay", () => {
  const tmp = mkdtempSync(join(tmpdir(), "relay-test-"));

  /** Ensure sqlite-vec extension loading runs before any plain `new Database`. */
  let _preloadMemories: ReturnType<typeof openMemoriesDatabase>;
  beforeAll(() => {
    _preloadMemories = openMemoriesDatabase(join(tmp, "_preload.db"));
  });

  afterAll(() => {
    _preloadMemories.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  /** Card store opens the memories DB first (sqlite-vec) then relay state. */
  test("card upsert and search", async () => {
    const { cardStore, stateDb, memoriesDb } = createRelayCardStore({
      stateDbPath: join(tmp, "card-state.db"),
      memoriesDbPath: join(tmp, "mem.db"),
      memoriesRoot: join(tmp, "memroot"),
    });
    await cardStore.upsertCard({
      actorHex: "deadbeef",
      displayName: "Alice",
      tagline: "builder",
      about: "ships TypeScript libraries",
      relayEndpoint: "http://127.0.0.1:9",
    });
    const hits = await cardStore.searchCards("TypeScript", 5);
    expect(hits.some((h) => h.actorHex === "deadbeef")).toBe(true);
    stateDb.close();
    memoriesDb.close();
  });

  test("room ticket helpers round-trip", async () => {
    const secret = generateRoomSecretHex();
    const sid = "session-test-1";
    const ticket = await signRoomTicket(sid, secret);
    expect(await verifyRoomTicket(sid, ticket, secret)).toBe(true);
    expect(await verifyRoomTicket("other", ticket, secret)).toBe(false);
  });

  test("frame queue enqueue and drain", () => {
    const db = new Database(":memory:");
    ensureRelaySchema(db);
    const q = createRelayFrameQueue(db);
    db.run(
      `INSERT INTO rooms (session_id, pairing_secret_hex, created_at, expires_at) VALUES ('s', 'aa', 1, 9999999999999)`,
    );
    const u8 = new Uint8Array([1, 2, 3]);
    const id = q.enqueue("s", u8);
    expect(id).toBeGreaterThan(0);
    const rows = q.drainFrom("s", 0);
    expect(rows.length).toBe(1);
    expect(rows[0]?.id).toBe(id);
    expect([...(rows[0]?.bytes ?? [])]).toEqual([1, 2, 3]);
  });

  test("room hub verify and replay", async () => {
    const db = new Database(":memory:");
    ensureRelaySchema(db);
    const fq = createRelayFrameQueue(db);
    const hub = createRelayRoomHub({ db, frameQueue: fq });
    const sid = "obp-room-1";
    const { ticket } = await hub.createRoom(sid);
    expect(await hub.verifyTicket(sid, ticket)).toBe(true);
    fq.enqueue(sid, new Uint8Array([9]));
    const rows = fq.drainFrom(sid, 0);
    expect(rows.length).toBe(1);
    expect([...(rows[0]?.bytes ?? [])]).toEqual([9]);
  });
});
