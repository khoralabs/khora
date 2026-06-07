import { createHash } from "node:crypto";
import { ObpError } from "@khoralabs/obp-errors";
import type { Frame, FrameType, Sha256HexLower } from "./frame-protocol-types";
import { toSha256HexLower } from "./frame-protocol-types";
import type { FrameSigner, FrameVerifier } from "./frame-signer";
import { signingBytesUtf8, tipSha256HexFromCompleteFrame } from "./frame-signing";

function bytesToHexLower(digest: Uint8Array): Sha256HexLower {
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

/** **`SHA-256(UTF-8(text))`** as **`Sha256HexLower`** (inbound frame tip from exact wire UTF-8). */
export function sha256HexLowerFromUtf8String(text: string): Sha256HexLower {
  const digest = new Uint8Array(createHash("sha256").update(text, "utf8").digest());
  return bytesToHexLower(digest);
}

/** Canonical signing bytes: full frame JSON with `sig` forced to `""`. */
export function signingPayloadBytes(frame: Frame): Uint8Array {
  return signingBytesUtf8(frame);
}

export class FrameDag {
  private tip: string;

  constructor(genesisHash: string) {
    this.tip = genesisHash;
  }

  get tipHash(): string {
    return this.tip;
  }

  async verifyInboundChild(frame: Frame, verifier: FrameVerifier): Promise<void> {
    if (frame.p_hash !== this.tip) {
      throw new ObpError("CAUSAL_MISMATCH", `expected p_hash ${this.tip}, got ${frame.p_hash}`);
    }
    const ok = await verifier.verify(frame.actor, signingPayloadBytes(frame), frame.sig);
    if (!ok) {
      throw new ObpError("BAD_SIG", "invalid frame signature");
    }
  }

  commitTip(nextTip: string): void {
    this.tip = String(nextTip);
  }

  async signOutboundAtTip(
    signer: FrameSigner,
    type: FrameType,
    body: Record<string, unknown>,
  ): Promise<{ frame: Frame; nextTip: Sha256HexLower }> {
    const unsigned: Frame = {
      p_hash: this.tip as Sha256HexLower,
      actor: signer.actor,
      sig: "",
      type,
      body: body as Frame["body"],
    };
    const sig = await signer.sign(signingPayloadBytes(unsigned));
    const complete: Frame = { ...unsigned, sig };
    const nextTip = tipSha256HexFromCompleteFrame(complete);
    return { frame: complete, nextTip };
  }

  async appendInbound(frame: Frame, verifier: FrameVerifier): Promise<void> {
    await this.verifyInboundChild(frame, verifier);
    this.commitTip(tipSha256HexFromCompleteFrame(frame));
  }

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
