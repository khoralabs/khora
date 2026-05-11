/** Ed25519 frame signatures (hex-encoded raw pubkey + hex-encoded 64-byte sig). */

const HEX = /^[0-9a-f]*$/;

export type FrameSigner = {
  readonly actor: string;
  sign(bytes: Uint8Array): Promise<string>;
};

export type FrameVerifier = {
  verify(actor: string, bytes: Uint8Array, sigHex: string): Promise<boolean>;
};

export async function generateEd25519KeyPair(): Promise<CryptoKeyPair> {
  const kp = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  return kp as CryptoKeyPair;
}

export async function publicKeyActorHex(publicKey: CryptoKey): Promise<string> {
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", publicKey));
  return bytesToHex(raw);
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !HEX.test(hex)) {
    throw new Error("invalid hex string");
  }
  const len = hex.length / 2;
  const buf = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    buf[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  /** TS lib variance: force ArrayBuffer-backed bytes for `BufferSource` crypto APIs */
  return Uint8Array.from(buf);
}

export async function importEd25519PublicKeyFromActorHex(actor: string): Promise<CryptoKey> {
  const raw = hexToBytes(actor);
  return crypto.subtle.importKey("raw", raw as never, { name: "Ed25519" }, true, ["verify"]);
}

export async function createEd25519FrameSigner(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
): Promise<FrameSigner> {
  const actor = await publicKeyActorHex(publicKey);
  return {
    actor,
    async sign(bytes: Uint8Array): Promise<string> {
      const sig = new Uint8Array(await crypto.subtle.sign("Ed25519", privateKey, bytes as never));
      return bytesToHex(sig);
    },
  };
}

export function createEd25519FrameVerifier(): FrameVerifier {
  return {
    async verify(actor: string, bytes: Uint8Array, sigHex: string): Promise<boolean> {
      const pk = await importEd25519PublicKeyFromActorHex(actor);
      const sig = hexToBytes(sigHex);
      return crypto.subtle.verify("Ed25519", pk, sig as never, bytes as never);
    },
  };
}
