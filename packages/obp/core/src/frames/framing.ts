import { canonicalJsonString } from "./canonical.ts";
import type { Frame, SessionCheckpoint, SessionEnvelopeWire } from "./types.ts";

/** Length-prefixed wire bytes (`uint32_be` big-endian, then payload). */
export function encodeLengthPrefixed(payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + payload.length);
  new DataView(out.buffer).setUint32(0, payload.length, false);
  out.set(payload, 4);
  return out;
}

export function encodeFramedJson(value: unknown): Uint8Array {
  return encodeLengthPrefixed(new TextEncoder().encode(canonicalJsonString(value)));
}

export type FrameDecoderYield =
  | { kind: "init"; value: unknown }
  | { kind: "frame"; value: Frame }
  | { kind: "session_envelope"; value: SessionEnvelopeWire }
  | { kind: "raw"; value: unknown };

/**
 * Incremental decoder for length-prefixed canonical-JSON messages.
 * First message may be `{ "init": SessionInit }` or a `Frame`.
 */
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
      return { kind: "frame", value: value as Frame };
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
    isRecord(v.body)
  );
}

function isSessionEnvelopeMessage(v: unknown): v is { session_envelope: SessionEnvelopeWire } {
  if (!isRecord(v) || !("session_envelope" in v)) return false;
  const e = v.session_envelope;
  if (!isRecord(e)) return false;
  if (typeof e.session_id !== "string" || typeof e.from_party !== "string") return false;
  if (!isCheckpointRecord(e.base_checkpoint) || !isCheckpointRecord(e.new_checkpoint)) return false;
  return Array.isArray(e.delta_ops);
}

function isCheckpointRecord(v: unknown): v is SessionCheckpoint {
  return isRecord(v) && typeof v.seq === "number" && typeof v.root_hex === "string";
}

/** Length-prefixed `{"session_envelope": …}` for the same stream as frames. */
export function encodeSessionEnvelopeMessage(envelope: SessionEnvelopeWire): Uint8Array {
  return encodeFramedJson({ session_envelope: envelope });
}
