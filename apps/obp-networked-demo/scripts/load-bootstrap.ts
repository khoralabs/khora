import type { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createEd25519FrameSigner } from "@cfd/obp-core";
import type { ObpDemoBootstrapFile } from "./bootstrap-types.ts";

export async function loadBootstrapFile(path?: string): Promise<ObpDemoBootstrapFile> {
  const p = resolve(
    process.cwd(),
    path ?? process.env.OBP_DEMO_BOOTSTRAP ?? ".obp-demo-bootstrap.local.json",
  );
  const raw = await readFile(p, "utf-8");
  return JSON.parse(raw) as ObpDemoBootstrapFile;
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

export async function responderSignerFromBootstrap(b: ObpDemoBootstrapFile) {
  const kp = await importEd25519Pair(b.responder);
  return createEd25519FrameSigner(kp.privateKey, kp.publicKey);
}

export async function initiatorSignerFromBootstrap(b: ObpDemoBootstrapFile) {
  const kp = await importEd25519Pair(b.initiator);
  return createEd25519FrameSigner(kp.privateKey, kp.publicKey);
}

export type { ObpDemoBootstrapFile } from "./bootstrap-types.ts";
