import type { webcrypto } from "node:crypto";
import type { Party, SessionInit } from "@khoralabs/obp-core";
import { createEd25519FrameSigner } from "@khoralabs/obp-core";

/** Responder-only runtime config. Holds the responder key; no shared secret required. */
export type ObpServerBootstrap = {
  responder: { privateKey: webcrypto.JsonWebKey; publicKey: webcrypto.JsonWebKey };
};

/** Initiator runtime config. Hold offline; never send to the responder host. */
export type ObpClientBootstrap = {
  initiator: { privateKey: webcrypto.JsonWebKey; publicKey: webcrypto.JsonWebKey };
  parties: Party[];
  init: SessionInit;
  /** Server's OBP actor hex. Pin this to verify future invites without a shared secret. */
  serverActorHex: string;
  /** Bearer token for `Authorization: Bearer …` — output of {@link signInvite}. */
  inviteToken: string;
};

export async function exportJwkPair(
  kp: CryptoKeyPair,
): Promise<{ privateKey: webcrypto.JsonWebKey; publicKey: webcrypto.JsonWebKey }> {
  const privateKey = await crypto.subtle.exportKey("jwk", kp.privateKey);
  const publicKey = await crypto.subtle.exportKey("jwk", kp.publicKey);
  return { privateKey, publicKey };
}

export async function importEd25519Pair(keys: {
  privateKey: webcrypto.JsonWebKey;
  publicKey: webcrypto.JsonWebKey;
}): Promise<CryptoKeyPair> {
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    keys.privateKey,
    { name: "Ed25519" },
    true,
    ["sign"],
  );
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    keys.publicKey,
    { name: "Ed25519" },
    true,
    ["verify"],
  );
  return { privateKey, publicKey };
}

export async function responderSignerFromBootstrap(b: ObpServerBootstrap) {
  const kp = await importEd25519Pair(b.responder);
  return createEd25519FrameSigner(kp.privateKey, kp.publicKey);
}

export async function initiatorSignerFromBootstrap(b: ObpClientBootstrap) {
  const kp = await importEd25519Pair(b.initiator);
  return createEd25519FrameSigner(kp.privateKey, kp.publicKey);
}
