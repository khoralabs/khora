import { Database } from "bun:sqlite";
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMemoryDuplexByteStreamPair } from "@khoralabs/duplex-byte-stream";
import { attachDuplexAsFrameRelayPeer } from "@khoralabs/obp-frame-relay";
import {
  decryptWireFrameBody,
  deriveFrameBodyAesKey,
  encodeFramedJson,
  encryptLogicalFrameBody,
  ephemeralX25519Keygen,
  x25519SharedSecret,
} from "@khoralabs/obp-frames-impl";
import { popRelayInboxDrainItemsForDid } from "./relay-inbox-drain";
import { deliverRoomTicketToPrincipal } from "./room-admission";
import { createTestKhoraHost } from "./test/bootstrap-sqlite";

const tmpRoot = mkdtempSync(join(tmpdir(), "khora-room-seam-"));
let seq = 0;
function nextHostDir(): string {
  const d = join(tmpRoot, `h${seq++}`);
  mkdirSync(d, { recursive: true });
  return d;
}

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

function parseRelayEnvelope(bytes: Uint8Array): {
  frame: Record<string, unknown>;
  relay_ts_ms: number;
} {
  const len = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, false);
  const text = new TextDecoder().decode(bytes.subarray(4, 4 + len));
  return JSON.parse(text) as {
    frame: Record<string, unknown>;
    relay_ts_ms: number;
  };
}

describe("room channel seam", () => {
  test("offline peer receives buffered frames in order after rotateChannelTicket", async () => {
    const root = nextHostDir();
    const framesPath = join(root, "f.sqlite");
    const ctx = await createTestKhoraHost({
      catalogPath: join(root, "c.sqlite"),
      framesDbPath: framesPath,
      cellsDir: join(root, "cells"),
      cellPoolCount: 2,
    });
    const roomId = crypto.randomUUID();
    const { ticket: senderTicket } = await ctx.roomHub.createChannel(roomId);

    const payloads = [
      encodeFramedJson({ ping: 1 }),
      encodeFramedJson({ ping: 2 }),
      encodeFramedJson({ ping: 3 }),
    ];

    const [senderClient, senderServer] = createMemoryDuplexByteStreamPair();
    const senderAttach = await attachDuplexAsFrameRelayPeer(
      ctx.roomHub,
      roomId,
      senderTicket,
      senderServer,
    );
    for (const p of payloads) {
      await senderClient.write(p);
      await new Promise<void>((r) => queueMicrotask(r));
    }
    await senderAttach.dispose();

    const { ticket: replayTicket } = await ctx.roomHub.rotateChannelTicket(roomId);

    const [_replayClient, replayServer] = createMemoryDuplexByteStreamPair();
    const replayed: Uint8Array[] = [];
    const replayPeer = {
      send(b: Uint8Array) {
        replayed.push(b);
      },
    };
    await ctx.roomHub.attachPeer(roomId, replayPeer, replayTicket);
    await attachDuplexAsFrameRelayPeer(ctx.roomHub, roomId, replayTicket, replayServer);

    for (let i = 0; i < 100 && replayed.length < payloads.length; i++) {
      await new Promise<void>((r) => queueMicrotask(r));
    }
    expect(replayed.length).toBeGreaterThanOrEqual(payloads.length);

    const db = new Database(framesPath);
    const rows = db
      .prepare(`SELECT bytes FROM room_frames WHERE channel_id = ? ORDER BY id ASC`)
      .all(roomId) as { bytes: Uint8Array }[];
    expect(rows.length).toBe(payloads.length);
    for (let i = 0; i < payloads.length; i++) {
      expect(Buffer.from(replayed[i] ?? [])).toEqual(Buffer.from(rows[i]?.bytes ?? []));
    }

    ctx.principalTeardownWorker.stop();
    ctx.cluster.close();
  });

  test("E2EE TURN body round-trips through hub relay envelope", async () => {
    const root = nextHostDir();
    const ctx = await createTestKhoraHost({
      catalogPath: join(root, "c.sqlite"),
      framesDbPath: join(root, "f.sqlite"),
      cellsDir: join(root, "cells"),
      cellPoolCount: 2,
    });
    const roomId = crypto.randomUUID();
    const { ticket } = await ctx.roomHub.createChannel(roomId);

    const kp1 = ephemeralX25519Keygen();
    const kp2 = ephemeralX25519Keygen();
    const shared = x25519SharedSecret(kp1.sk, kp2.pk);
    const aes = await deriveFrameBodyAesKey({
      sharedSecret: shared,
      sessionId: "sess-1",
      channelBinding: roomId,
    });
    const logical = { offer: "test-payload", n: 42 };
    const wireBody = await encryptLogicalFrameBody(aes, logical);
    const raw = encodeFramedJson({
      p_hash: "a".repeat(64),
      actor: "00",
      sig: "s",
      type: "TURN",
      body: wireBody,
    });

    const [senderClient, senderServer] = createMemoryDuplexByteStreamPair();
    const senderAttach = await attachDuplexAsFrameRelayPeer(
      ctx.roomHub,
      roomId,
      ticket,
      senderServer,
    );
    await senderClient.write(raw);
    for (let i = 0; i < 30; i++) {
      await new Promise<void>((r) => queueMicrotask(r));
    }
    await senderAttach.dispose();

    const framesPath = join(root, "f.sqlite");
    const db = new Database(framesPath);
    expect(
      (
        db.prepare(`SELECT COUNT(*) AS c FROM room_frames WHERE channel_id = ?`).get(roomId) as {
          c: number;
        }
      ).c,
    ).toBe(1);

    const received: Uint8Array[] = [];
    await ctx.roomHub.attachPeer(
      roomId,
      {
        send(b) {
          received.push(b);
        },
      },
      ticket,
    );
    expect(received.length).toBeGreaterThanOrEqual(1);

    const env = parseRelayEnvelope(received[0] ?? new Uint8Array());
    const frame = env.frame;
    const back = await decryptWireFrameBody(aes, frame.body as Record<string, unknown>);
    expect(back).toEqual(logical);

    ctx.principalTeardownWorker.stop();
    ctx.cluster.close();
  });

  test("inbox room_ticket has no frame bytes; frame channel holds spool separately", async () => {
    const root = nextHostDir();
    const framesPath = join(root, "f.sqlite");
    const ctx = await createTestKhoraHost({
      catalogPath: join(root, "c.sqlite"),
      framesDbPath: framesPath,
      cellsDir: join(root, "cells"),
      cellPoolCount: 2,
    });
    const roomId = "room-seam-inbox";
    await ctx.roomHub.createChannel(roomId);
    ctx.frameRelayStore.enqueueRelayedFrame(roomId, new Uint8Array([0xde, 0xad]));

    await deliverRoomTicketToPrincipal(ctx, "did:peer", {
      kind: "room_ticket",
      channelId: roomId,
      ticket: "t1",
      webSocketUrl: "wss://h/ws",
      expiresAtMs: Date.now() + 60_000,
      issuedAtMs: Date.now(),
      fromPrincipalId: "did:creator",
    });

    const items = await popRelayInboxDrainItemsForDid(ctx, "did:peer");
    expect(items).toHaveLength(1);
    const proj = items[0]?.projection as Record<string, unknown>;
    expect(proj.kind).toBe("room_ticket");
    expect(JSON.stringify(proj)).not.toContain("dead");

    const db = new Database(framesPath);
    const frameBytes = (
      db.prepare(`SELECT bytes FROM room_frames WHERE channel_id = ?`).get(roomId) as {
        bytes: Uint8Array;
      }
    ).bytes;
    expect(frameBytes[0]).toBe(0xde);

    ctx.principalTeardownWorker.stop();
    ctx.cluster.close();
  });
});
