import { canonicalJsonString } from "./canonical-json";
import type { FramedWireObject } from "./frame-protocol-types";
import { encodeLengthPrefixed } from "./length-prefix";

/**
 * Length-prefixed wire bytes: **`uint32_be(length)`** then **`UTF-8(canonical_json(...))`**
 * per **`NegotiationFrameProtocol`** default framing.
 */
export function encodeFramedJson(value: unknown): Uint8Array {
  return encodeLengthPrefixed(new TextEncoder().encode(canonicalJsonString(value)));
}

/** Same as {@link encodeFramedJson} but only accepts normative **`init`** envelope or **`Frame`** shapes. */
export function encodeFramedWire(value: FramedWireObject): Uint8Array {
  return encodeFramedJson(value);
}
