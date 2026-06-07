import { describe, expect, test } from "bun:test";
import { createMemoryDuplexByteStreamPair } from "@khoralabs/duplex-byte-stream";
import { encodeFramedJson } from "@khoralabs/obp-frames-impl";
import { attachDuplexAsFrameRelayPeer } from "./duplex-peer";
import { createFrameRelayHub } from "./hub";
import { InMemoryFrameRelayStoreStrategy } from "./in-memory-store-strategy";

describe("createFrameRelayHub", () => {
  test("createChannel clears prior frames", async () => {
    const store = new InMemoryFrameRelayStoreStrategy();
    const hub = createFrameRelayHub({ store });
    store.enqueueRelayedFrame("room-a", new Uint8Array([1]));
    await hub.createChannel("room-a");
    expect(store.listRelayedFramesAfter("room-a", 0)).toHaveLength(0);
  });

  test("relayBytes echoes wrapped frame to every peer including sender", async () => {
    const store = new InMemoryFrameRelayStoreStrategy();
    const hub = createFrameRelayHub({ store });
    await hub.createChannel("room-a");

    const received: Uint8Array[] = [];
    const p1 = {
      send(b: Uint8Array) {
        received.push(b);
      },
    };
    const p2 = {
      send(b: Uint8Array) {
        received.push(b);
      },
    };
    await hub.attachPeer("room-a", p1);
    await hub.attachPeer("room-a", p2);

    const frame = {
      p_hash: "a".repeat(64),
      actor: "00",
      sig: "s",
      type: "TURN",
      body: {},
    };
    const raw = encodeFramedJson(frame);
    hub.relayBytes("room-a", p1, raw);

    expect(received.length).toBe(2);
    for (const b of received) {
      const len = new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(0, false);
      expect(4 + len).toBe(b.length);
      const json = JSON.parse(new TextDecoder().decode(b.subarray(4, 4 + len))) as {
        frame: unknown;
        relay_ts_ms: number;
      };
      expect(json.relay_ts_ms).toEqual(expect.any(Number));
      expect((json.frame as { type: string }).type).toBe("TURN");
    }
  });

  test("relayBytes wraps TURN with E2EE ciphertext body", async () => {
    const store = new InMemoryFrameRelayStoreStrategy();
    const hub = createFrameRelayHub({ store });
    await hub.createChannel("room-a");

    const received: Uint8Array[] = [];
    const p1 = {
      send(b: Uint8Array) {
        received.push(b);
      },
    };
    await hub.attachPeer("room-a", p1);

    const frame = {
      p_hash: "a".repeat(64),
      actor: "00",
      sig: "s",
      type: "TURN",
      body: {
        e2ee: { v: 1, alg: "A256GCM", iv: "AAAA", ct: "BBBB" },
      },
    };
    const raw = encodeFramedJson(frame);
    hub.relayBytes("room-a", p1, raw);

    expect(received.length).toBe(1);
    const json = JSON.parse(
      new TextDecoder().decode(received[0]?.subarray(4, 4 + (received[0]?.length ?? 0) - 4)),
    ) as { frame: { body: { e2ee: { ct: string } } } };
    expect(json.frame.body.e2ee.ct).toBe("BBBB");
  });
});

describe("attachDuplexAsFrameRelayPeer", () => {
  test("inbound duplex bytes are relayed to other peers", async () => {
    const store = new InMemoryFrameRelayStoreStrategy();
    const hub = createFrameRelayHub({ store });
    await hub.createChannel("room-a");

    const [clientSide, serverSide] = createMemoryDuplexByteStreamPair();
    await attachDuplexAsFrameRelayPeer(hub, "room-a", serverSide);

    const received: Uint8Array[] = [];
    await hub.attachPeer("room-a", {
      send(b) {
        received.push(b);
      },
    });

    const frame = {
      p_hash: "a".repeat(64),
      actor: "00",
      sig: "s",
      type: "TURN",
      body: {},
    };
    const raw = encodeFramedJson(frame);
    await clientSide.write(raw);

    for (let i = 0; i < 50 && received.length === 0; i++) {
      await new Promise<void>((r) => queueMicrotask(r));
    }

    expect(received.length).toBeGreaterThanOrEqual(1);
    await clientSide.close();
  });

  test("dispose closes duplex", async () => {
    const store = new InMemoryFrameRelayStoreStrategy();
    const hub = createFrameRelayHub({ store });
    await hub.createChannel("room-x");

    const [clientSide, serverSide] = createMemoryDuplexByteStreamPair();
    const { dispose } = await attachDuplexAsFrameRelayPeer(hub, "room-x", serverSide);
    await dispose();
    await clientSide.close();
  });
});
