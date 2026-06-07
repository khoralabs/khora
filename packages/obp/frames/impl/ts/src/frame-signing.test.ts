import { describe, expect, test } from "bun:test";
import { canonicalJsonString } from "./canonical-json";
import { FrameType, toSha256HexLower } from "./frame-protocol-types";
import {
  frameSigningPayload,
  signingBytesUtf8,
  tipSha256HexFromCompleteFrame,
} from "./frame-signing";

const zero = toSha256HexLower("0".repeat(64));

const sampleFrame = {
  p_hash: zero,
  actor: "0xaa",
  sig: "sig-bytes",
  type: FrameType.TURN,
  body: { offerId: "o1" },
} as const;

describe("frameSigningPayload", () => {
  test("clears sig", () => {
    const p = frameSigningPayload(sampleFrame);
    expect(p.sig).toBe("");
    expect(p.actor).toBe(sampleFrame.actor);
  });
});

describe("signingBytesUtf8", () => {
  test("matches UTF-8 of canonical_json(signing_payload)", () => {
    const bytes = signingBytesUtf8(sampleFrame);
    const payload = frameSigningPayload(sampleFrame);
    expect(new TextDecoder().decode(bytes)).toBe(canonicalJsonString(payload));
  });
});

describe("tipSha256HexFromCompleteFrame", () => {
  test("64-char hex", () => {
    const tip = tipSha256HexFromCompleteFrame(sampleFrame);
    expect(tip).toMatch(/^[0-9a-f]{64}$/);
  });

  test("stable for same frame", () => {
    expect(tipSha256HexFromCompleteFrame(sampleFrame)).toBe(
      tipSha256HexFromCompleteFrame(sampleFrame),
    );
  });
});
