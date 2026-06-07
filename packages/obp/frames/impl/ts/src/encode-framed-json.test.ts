import { describe, expect, test } from "bun:test";
import { canonicalJsonString } from "./canonical-json";
import { encodeFramedJson, encodeFramedWire } from "./encode-framed-json";
import { FrameType, toSha256HexLower } from "./frame-protocol-types";

const gh = toSha256HexLower("d".repeat(64));
const ph = toSha256HexLower("e".repeat(64));

describe("encodeFramedWire", () => {
  test("Frame roundtrips length + UTF-8 JSON", () => {
    const frame = {
      p_hash: ph,
      actor: "act",
      sig: "sig",
      type: FrameType.TERMINATE,
      body: { reason: "bye" },
    };
    const buf = encodeFramedWire(frame);
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const len = dv.getUint32(0, false);
    expect(len).toBe(buf.length - 4);
    const json = new TextDecoder().decode(buf.subarray(4));
    expect(json).toBe(canonicalJsonString(frame));
  });

  test("init envelope", () => {
    const init = {
      init: {
        session_id: "sid",
        party_ids: ["p1", "p2"],
        actor_pubkeys: ["0x01", "0x02"],
        genesis_hash: gh,
      },
    };
    const buf = encodeFramedWire(init);
    const len = new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(0, false);
    expect(len).toBe(buf.length - 4);
  });
});

describe("encodeFramedJson", () => {
  test("accepts arbitrary object for extension envelopes", () => {
    const buf = encodeFramedJson({ session_envelope: { session_id: "x" } });
    expect(buf.length).toBeGreaterThan(4);
  });
});
