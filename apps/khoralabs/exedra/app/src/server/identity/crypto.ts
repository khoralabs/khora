import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { PersistableSigner } from "@khoralabs/did-key-identity";
import { EdDSASigner } from "iso-signatures/signers/eddsa.js";

const ALGO = "aes-256-gcm";

type StoredIdentity = {
  did: string;
  encoded: string;
};

export function encryptIdentityPayload(plaintext: string, key: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

export function decryptIdentityPayload(payload: Buffer, key: Buffer): string {
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export async function loadSignerFromEncryptedBlob(
  payload: Buffer,
  key: Buffer,
): Promise<PersistableSigner> {
  const parsed = JSON.parse(decryptIdentityPayload(payload, key)) as StoredIdentity;
  if (typeof parsed.encoded !== "string" || parsed.encoded.length === 0) {
    throw new Error("identity blob missing encoded key");
  }
  const signer = await EdDSASigner.import(parsed.encoded);
  if (typeof parsed.did === "string" && parsed.did.length > 0 && parsed.did !== signer.did) {
    throw new Error("identity blob did mismatch");
  }
  return signer;
}
