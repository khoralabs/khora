/**
 * **`signing_bytes`** and post-frame **tip** hash from `NegotiationFrameProtocol` docs in
 * `packages/obp/v2/frames/spec/model/frame-protocol.smithy`.
 */

import { createHash } from "node:crypto";
import { canonicalJsonString } from "./canonical-json.ts";
import type { Frame } from "./frame-protocol-types.ts";
import { type Sha256HexLower, toSha256HexLower } from "./frame-protocol-types.ts";

/** `signing_payload`: same fields as `Frame` with **`sig`** set to the empty string. */
export type FrameSigningPayload = Omit<Frame, "sig"> & { sig: "" };

export function frameSigningPayload(frame: Frame): FrameSigningPayload {
  return {
    p_hash: frame.p_hash,
    actor: frame.actor,
    sig: "",
    type: frame.type,
    body: frame.body,
  };
}

/** `signing_bytes = UTF-8(canonical_json(signing_payload))`. */
export function signingBytesUtf8(frame: Frame): Uint8Array {
  return new TextEncoder().encode(canonicalJsonString(frameSigningPayload(frame)));
}

function sha256HexLowerUtf8(utf8: Uint8Array): Sha256HexLower {
  const digest = new Uint8Array(createHash("sha256").update(utf8).digest());
  let s = "";
  for (let i = 0; i < digest.length; i++) {
    const b = digest[i];
    if (b === undefined) {
      throw new Error("unexpected digest length");
    }
    s += b.toString(16).padStart(2, "0");
  }
  return toSha256HexLower(s);
}

/**
 * Local DAG tip after accepting a frame: **`SHA-256( UTF-8(canonical_json(frame_complete)) )`**
 * as **`Sha256HexLower`** (next frame's **`p_hash`** MUST equal this).
 */
export function tipSha256HexFromCompleteFrame(frame: Frame): Sha256HexLower {
  return sha256HexLowerUtf8(new TextEncoder().encode(canonicalJsonString(frame)));
}
