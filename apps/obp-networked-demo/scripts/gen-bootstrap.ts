/**
 * Writes `.obp-demo-bootstrap.local.json` (or OBP_DEMO_BOOTSTRAP): SessionInit, Party[], Ed25519 JWK key pairs.
 * Run: `bun run bootstrap` from this app directory.
 */

import type { webcrypto } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  createEd25519FrameSigner,
  generateEd25519KeyPair,
  type SessionInit,
  sha256HexUtf8,
} from "@cfd/obp-core";
import { FakeObpPersistence } from "@cfd/obp-core/testing";
import type { ObpDemoBootstrapFile } from "./bootstrap-types.ts";

async function exportJwkPair(
  kp: CryptoKeyPair,
): Promise<{ privateKey: webcrypto.JsonWebKey; publicKey: webcrypto.JsonWebKey }> {
  const privateKey = await crypto.subtle.exportKey("jwk", kp.privateKey);
  const publicKey = await crypto.subtle.exportKey("jwk", kp.publicKey);
  return { privateKey, publicKey };
}

async function generateDemoBootstrap(): Promise<ObpDemoBootstrapFile> {
  let seq = 0;
  const ledgerSeq = () => ++seq;
  const persistence = new FakeObpPersistence(ledgerSeq);
  const rParty = persistence.registerParty({ name: "demo-responder", sourcemaps: [] }).party;
  const iParty = persistence.registerParty({ name: "demo-initiator", sourcemaps: [] }).party;

  const rKeys = await generateEd25519KeyPair();
  const iKeys = await generateEd25519KeyPair();
  const rSigner = await createEd25519FrameSigner(rKeys.privateKey, rKeys.publicKey);
  const iSigner = await createEd25519FrameSigner(iKeys.privateKey, iKeys.publicKey);

  const genesis_hash = await sha256HexUtf8("obp-networked-demo-bootstrap-v1");
  const init: SessionInit = {
    session_id: "obp-networked-demo",
    party_ids: [rParty.id, iParty.id],
    actor_pubkeys: [rSigner.actor, iSigner.actor],
    genesis_hash,
  };

  return {
    init,
    parties: [rParty, iParty],
    responder: await exportJwkPair(rKeys),
    initiator: await exportJwkPair(iKeys),
  };
}

export async function writeDemoBootstrap(outPath: string): Promise<ObpDemoBootstrapFile> {
  const data = await generateDemoBootstrap();
  const json = `${JSON.stringify(data, null, 2)}\n`;
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, json, "utf-8");
  return data;
}

const defaultPath = resolve(
  process.cwd(),
  process.env.OBP_DEMO_BOOTSTRAP ?? ".obp-demo-bootstrap.local.json",
);
if (import.meta.main) {
  const boot = await writeDemoBootstrap(defaultPath);
  console.log(`Wrote bootstrap to ${defaultPath}`);
  console.log("session_id:", boot.init.session_id);
  console.log("party_ids:", boot.init.party_ids);
}
