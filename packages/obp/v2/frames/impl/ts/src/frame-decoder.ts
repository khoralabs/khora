import { encodeFramedJson } from "./encode-framed-json.ts";
import type { Frame, SessionEnvelopeWire } from "./frame-protocol-types.ts";

export type FrameDecoderYield =
  | { kind: "init"; value: unknown }
  | { kind: "frame"; value: Frame; wireUtf8: string }
  | { kind: "session_envelope"; value: SessionEnvelopeWire }
  | { kind: "raw"; value: unknown };

export function createFrameDecoder(): {
  push(chunk: Uint8Array): FrameDecoderYield[];
  reset(): void;
} {
  let buf: Uint8Array = new Uint8Array(0);

  const concat = (a: Uint8Array, b: Uint8Array): Uint8Array => {
    const out = new Uint8Array(a.length + b.length);
    out.set(a);
    out.set(b, a.length);
    return out;
  };

  const copyUint8 = (u: Uint8Array): Uint8Array => {
    const out = new Uint8Array(u.byteLength);
    out.set(u);
    return out;
  };

  const tryParseOne = (): FrameDecoderYield | null => {
    if (buf.length < 4) return null;
    const len = new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(0, false);
    if (buf.length < 4 + len) return null;
    const jsonBytes = buf.subarray(4, 4 + len);
    buf = buf.length > 4 + len ? new Uint8Array(buf.subarray(4 + len)) : new Uint8Array(0);
    const text = new TextDecoder().decode(jsonBytes);
    const value = JSON.parse(text) as unknown;
    if (isRecord(value) && "init" in value) {
      return { kind: "init", value };
    }
    if (isFrameLike(value)) {
      return { kind: "frame", value: value as Frame, wireUtf8: text };
    }
    if (isSessionEnvelopeMessage(value)) {
      return { kind: "session_envelope", value: value.session_envelope };
    }
    return { kind: "raw", value };
  };

  return {
    push(chunk: Uint8Array): FrameDecoderYield[] {
      const c = copyUint8(chunk);
      buf = buf.length === 0 ? c : concat(buf, c);
      const out: FrameDecoderYield[] = [];
      for (;;) {
        const one = tryParseOne();
        if (one === null) break;
        out.push(one);
      }
      return out;
    },
    reset(): void {
      buf = new Uint8Array(0);
    },
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isFrameLike(v: unknown): boolean {
  if (!isRecord(v)) return false;
  return (
    typeof v.p_hash === "string" &&
    typeof v.actor === "string" &&
    typeof v.sig === "string" &&
    typeof v.type === "string" &&
    typeof v.body === "object" &&
    v.body !== null &&
    !Array.isArray(v.body)
  );
}

function isCheckpointRecord(v: unknown): v is SessionEnvelopeWire["base_checkpoint"] {
  return isRecord(v) && typeof v.seq === "number" && typeof v.root_hex === "string";
}

function isSessionEnvelopeMessage(v: unknown): v is { session_envelope: SessionEnvelopeWire } {
  if (!isRecord(v) || !("session_envelope" in v)) return false;
  const e = v.session_envelope;
  if (!isRecord(e)) return false;
  if (typeof e.session_id !== "string" || typeof e.from_party !== "string") return false;
  if (!isCheckpointRecord(e.base_checkpoint) || !isCheckpointRecord(e.new_checkpoint)) return false;
  return Array.isArray(e.delta_ops);
}

export function encodeSessionEnvelopeMessage(envelope: SessionEnvelopeWire): Uint8Array {
  return encodeFramedJson({ session_envelope: envelope });
}
