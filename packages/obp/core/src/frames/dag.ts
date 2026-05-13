import { ObpError } from "../obp-error.ts";
import { canonicalJsonString } from "./canonical.ts";
import type { FrameSigner, FrameVerifier } from "./signer.ts";
import type { Frame, FrameType } from "./types.ts";

export async function sha256HexUtf8(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return bytesToHex(new Uint8Array(digest));
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Canonical signing bytes: full frame JSON with `sig` forced to `""`. */
export function signingPayloadBytes(frame: Frame): Uint8Array {
  const payload: Frame = { ...frame, sig: "" };
  return new TextEncoder().encode(canonicalJsonString(payload));
}

export class FrameDag {
  private tip: string;

  constructor(genesisHash: string) {
    this.tip = genesisHash;
  }

  get tipHash(): string {
    return this.tip;
  }

  /**
   * Verify inbound causal chain + signature **without** advancing {@link tipHash}.
   * Caller must {@link commitTip} only after persistence effects succeed (for `TURN`).
   */
  async verifyInboundChild(frame: Frame, verifier: FrameVerifier): Promise<void> {
    if (frame.p_hash !== this.tip) {
      throw new ObpError("CAUSAL_MISMATCH", `expected p_hash ${this.tip}, got ${frame.p_hash}`);
    }
    const ok = await verifier.verify(frame.actor, signingPayloadBytes(frame), frame.sig);
    if (!ok) {
      throw new ObpError("BAD_SIG", "invalid frame signature");
    }
  }

  /** Advance tip to `nextTip` (typically `sha256(canonical frame)` after verify + graph commit). */
  commitTip(nextTip: string): void {
    this.tip = nextTip;
  }

  /** Signed outbound frame at current tip; does **not** mutate {@link tipHash}. */
  async signOutboundAtTip(
    signer: FrameSigner,
    type: FrameType,
    body: Record<string, unknown>,
  ): Promise<{ frame: Frame; nextTip: string }> {
    const unsigned: Frame = {
      p_hash: this.tip,
      actor: signer.actor,
      sig: "",
      type,
      body,
    };
    const sig = await signer.sign(signingPayloadBytes(unsigned));
    const complete: Frame = { ...unsigned, sig };
    const nextTip = await sha256HexUtf8(canonicalJsonString(complete));
    return { frame: complete, nextTip };
  }

  async appendInbound(frame: Frame, verifier: FrameVerifier): Promise<void> {
    await this.verifyInboundChild(frame, verifier);
    this.commitTip(await sha256HexUtf8(canonicalJsonString(frame)));
  }

  /** Create a signed outbound frame advancing the tip (verify-then-commit callers should prefer {@link signOutboundAtTip} + {@link commitTip}). */
  async mintOutbound(
    signer: FrameSigner,
    type: FrameType,
    body: Record<string, unknown>,
  ): Promise<Frame> {
    const { frame, nextTip } = await this.signOutboundAtTip(signer, type, body);
    this.commitTip(nextTip);
    return frame;
  }
}
