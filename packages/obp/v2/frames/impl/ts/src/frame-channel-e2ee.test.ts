import { describe, expect, test } from "bun:test";

import {
  deriveFrameBodyAesKey,
  encryptLogicalFrameBody,
  decryptWireFrameBody,
  ephemeralX25519Keygen,
  minActorPubkeyFromInit,
  x25519SharedSecret,
} from "./frame-channel-e2ee.ts";

describe("frame-channel-e2ee", () => {
  test("minActorPubkeyFromInit lexicographic min", () => {
    const a = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const b = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    expect(minActorPubkeyFromInit([{ pubkey: b }, { pubkey: a }])).toBe(a);
    expect(minActorPubkeyFromInit([{ pubkey: a }, { pubkey: b }])).toBe(a);
  });

  test("roundtrip encrypt / decrypt", async () => {
    const kp1 = ephemeralX25519Keygen();
    const kp2 = ephemeralX25519Keygen();
    const shared = x25519SharedSecret(kp1.sk, kp2.pk);
    const sharedRev = x25519SharedSecret(kp2.sk, kp1.pk);
    expect(shared.length).toBe(32);
    expect(Buffer.from(shared).equals(Buffer.from(sharedRev))).toBe(true);

    const aes = await deriveFrameBodyAesKey({
      sharedSecret: shared,
      sessionId: "sid",
      channelBinding: "room-1",
    });
    const logical = { hello: "world", n: 1 };
    const wire = await encryptLogicalFrameBody(aes, logical);
    const back = await decryptWireFrameBody(aes, wire);
    expect(back).toEqual(logical);
  });

  test("binding changes derived key", async () => {
    const kp1 = ephemeralX25519Keygen();
    const kp2 = ephemeralX25519Keygen();
    const shared = x25519SharedSecret(kp1.sk, kp2.pk);
    const k1 = await deriveFrameBodyAesKey({ sharedSecret: shared, sessionId: "s", channelBinding: "a" });
    const k2 = await deriveFrameBodyAesKey({ sharedSecret: shared, sessionId: "s", channelBinding: "b" });
    const w = await encryptLogicalFrameBody(k1, { x: 1 });
    await expect(decryptWireFrameBody(k2, w)).rejects.toThrow();
  });
});
