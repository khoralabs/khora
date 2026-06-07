/**
 * Length-prefixed wire bytes: **`uint32_be(length)`** (big-endian), then **`length`** bytes of payload
 * (`NegotiationFrameProtocol` default framing).
 */
export function encodeLengthPrefixed(payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + payload.length);
  new DataView(out.buffer).setUint32(0, payload.length, false);
  out.set(payload, 4);
  return out;
}
