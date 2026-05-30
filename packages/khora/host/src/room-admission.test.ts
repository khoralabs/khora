import { Database } from "bun:sqlite";
import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mintRoomChannelTicketAndSync } from "./room-admission.ts";
import { createTestKhoraHost } from "./test/bootstrap-sqlite.ts";

const tmpRoot = mkdtempSync(join(tmpdir(), "khora-room-admission-"));
let seq = 0;
function nextHostDir(): string {
  const d = join(tmpRoot, `h${seq++}`);
  mkdirSync(d, { recursive: true });
  return d;
}

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

test("mintRoomChannelTicketAndSync twice preserves room_frames and verifies new ticket", async () => {
  const root = nextHostDir();
  const framesPath = join(root, "f.sqlite");
  const ctx = await createTestKhoraHost({
    catalogPath: join(root, "c.sqlite"),
    framesDbPath: framesPath,
    cellsDir: join(root, "cells"),
    cellPoolCount: 2,
  });
  const roomId = crypto.randomUUID();
  await ctx.roomHub.createChannel(roomId);
  const hubPersistence = ctx.host.persistenceClient.persistence.frameChannelHubPersistence;
  hubPersistence.enqueueFrame(roomId, new Uint8Array([9, 8, 7]));

  const db = new Database(framesPath);
  const frameCount = () =>
    (
      db
        .prepare(`SELECT COUNT(*) AS c FROM room_frames WHERE channel_id = ?`)
        .get(roomId) as { c: number }
    ).c;

  expect(frameCount()).toBe(1);

  const registry = { creatorDid: "did:creator", inviteTargetDid: "did:peer" as string | null };
  const upsert = (id: string, row: typeof registry & { expiresAtMs: number }) => {
    ctx.upsertRoomRegistryRow(id, row);
  };
  ctx.upsertRoomRegistryRow(roomId, { ...registry, expiresAtMs: Date.now() + 60_000 });
  ctx.social.createRelationship({
    channelId: roomId,
    creatorPrincipalId: registry.creatorDid,
    expiresAtMs: Date.now() + 60_000,
  });

  const first = await mintRoomChannelTicketAndSync({
    roomHub: ctx.roomHub,
    social: ctx.social,
    roomId,
    ttlMs: 60_000,
    registryMeta: registry,
    upsertRoomRegistry: upsert,
    webSocketBase: "ws://127.0.0.1:8787",
  });
  expect(frameCount()).toBe(1);
  expect(await ctx.roomHub.verifyTicket(roomId, first.ticket)).toBe(true);

  const second = await mintRoomChannelTicketAndSync({
    roomHub: ctx.roomHub,
    social: ctx.social,
    roomId,
    ttlMs: 60_000,
    registryMeta: registry,
    upsertRoomRegistry: upsert,
    webSocketBase: "ws://127.0.0.1:8787",
  });
  expect(frameCount()).toBe(1);
  expect(await ctx.roomHub.verifyTicket(roomId, second.ticket)).toBe(true);
  expect(await ctx.roomHub.verifyTicket(roomId, first.ticket)).toBe(false);
});
