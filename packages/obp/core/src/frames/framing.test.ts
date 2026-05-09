import { expect, test } from "bun:test";
import { canonicalJsonString } from "./canonical.ts";
import { sha256HexUtf8 } from "./dag.ts";
import { createFrameDecoder, encodeFramedJson } from "./framing.ts";
import type { Frame } from "./types.ts";

test("frame decoder wireUtf8 hashes match mint canonical hash", async () => {
  const frame: Frame = {
    p_hash: "a".repeat(64),
    actor: "b".repeat(64),
    sig: "c".repeat(128),
    type: "TURN",
    body: {
      offerId: "oid",
      offerType: "Software License Agreement v1.0",
      ports: [{ id: "p1", promise: "pr", max_bindings: 1, terminal: false }],
    },
  };
  const mintTip = await sha256HexUtf8(canonicalJsonString(frame));
  const buf = encodeFramedJson(frame);
  const decoder = createFrameDecoder();
  const parts = decoder.push(buf);
  expect(parts.length).toBe(1);
  const p = parts[0];
  if (p.kind !== "frame") throw new Error("expected frame");
  const inboundTip = await sha256HexUtf8(p.wireUtf8);
  expect(inboundTip).toBe(mintTip);
});

test("re-canonicalizing parsed frame can diverge from wire; wireUtf8 stays aligned", async () => {
  const rawJson = `{"type":"TURN","sig":"${"s".repeat(128)}","body":{"offerType":"z","offerId":"w"},"p_hash":"${"p".repeat(64)}","actor":"aa"}`;
  const decoder = createFrameDecoder();
  const payload = new TextEncoder().encode(rawJson);
  const len = new Uint8Array(4 + payload.length);
  new DataView(len.buffer).setUint32(0, payload.length, false);
  len.set(payload, 4);
  const parts = decoder.push(len);
  expect(parts.length).toBe(1);
  const p = parts[0];
  if (p.kind !== "frame") throw new Error("expected frame");
  const fromWire = await sha256HexUtf8(p.wireUtf8);
  const fromParsed = await sha256HexUtf8(canonicalJsonString(p.value));
  expect(fromWire).toBe(await sha256HexUtf8(rawJson));
  expect(fromParsed).not.toBe(fromWire);
});
