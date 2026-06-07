import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { createSqliteFrameRelayStoreStrategy } from "./strategy";

describe("createSqliteFrameRelayStoreStrategy", () => {
  test("persists admission and relayed frames", () => {
    const db = new Database(":memory:");
    const store = createSqliteFrameRelayStoreStrategy(db);
    const now = Date.now();
    store.upsertChannelAdmission({
      channelId: "ch-1",
      pairingSecretHex: "abc",
      createdAtMs: now,
      expiresAtMs: now + 60_000,
    });
    expect(store.getPairingSecretIfActive("ch-1", now)).toBe("abc");
    const id = store.enqueueRelayedFrame("ch-1", new Uint8Array([1, 2, 3]));
    expect(id).toBe(1);
    expect(store.listRelayedFramesAfter("ch-1", 0)).toHaveLength(1);
    store.purgeRelayedFramesForChannel("ch-1");
    expect(store.listRelayedFramesAfter("ch-1", 0)).toHaveLength(0);
    store.deleteChannelAdmission("ch-1");
    expect(store.getPairingSecretIfActive("ch-1", now)).toBeUndefined();
  });
});
