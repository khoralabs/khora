import { encodeFramedJson, isNegotiationFrameObject } from "@khoralabs/obp-v2-frames-impl";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isRelayEnvelopeShape(v: unknown): boolean {
  if (!isRecord(v)) return false;
  return "frame" in v && "relay_ts_ms" in v;
}

/** Stamp negotiation frames with {@link khora.obp.frame.relay#RelayEnvelope} when relaying through a hub. */
export function relayOutBytesForMessage(bytes: Uint8Array, relayTsMs = Date.now()): Uint8Array {
  if (bytes.length < 4) return bytes;
  try {
    const len = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, false);
    if (4 + len !== bytes.length) return bytes;
    const text = new TextDecoder().decode(bytes.subarray(4, 4 + len));
    const value = JSON.parse(text) as unknown;
    if (!isRecord(value)) return bytes;
    if ("init" in value || "session_envelope" in value) return bytes;
    if (isRelayEnvelopeShape(value)) return bytes;
    if (isNegotiationFrameObject(value)) {
      return encodeFramedJson({
        frame: value,
        relay_ts_ms: relayTsMs,
      });
    }
  } catch {
    return bytes;
  }
  return bytes;
}
