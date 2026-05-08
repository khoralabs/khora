/**
 * Writes server + client bootstrap artifacts (gitignored).
 * Server artifact holds only the responder Ed25519 key.
 * Client artifact holds the initiator key, session params, and a server-signed invite token.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  exportJwkPair,
  type ObpClientBootstrap,
  type ObpServerBootstrap,
  signInvite,
} from "@cfd/obp-auth";
import {
  createEd25519FrameSigner,
  generateEd25519KeyPair,
  normalizeSessionInit,
  sha256HexUtf8,
} from "@cfd/obp-core";
import { FakeObpPersistence } from "@cfd/obp-core/testing";

export async function writeDemoBootstrap(
  serverOutPath: string,
  clientOutPath: string,
): Promise<{ server: ObpServerBootstrap; client: ObpClientBootstrap }> {
  let seq = 0;
  const persistence = new FakeObpPersistence(() => ++seq);
  const rParty = persistence.registerParty({ name: "demo-server", sourcemaps: [] }).party;
  const iParty = persistence.registerParty({ name: "demo-client", sourcemaps: [] }).party;

  const rKeys = await generateEd25519KeyPair();
  const iKeys = await generateEd25519KeyPair();
  const rSigner = await createEd25519FrameSigner(rKeys.privateKey, rKeys.publicKey);
  const iSigner = await createEd25519FrameSigner(iKeys.privateKey, iKeys.publicKey);

  const init = normalizeSessionInit({
    session_id: "obp-networked-demo",
    parties: [
      { id: rParty.id, pubkey: rSigner.actor },
      { id: iParty.id, pubkey: iSigner.actor },
    ],
    genesis_hash: await sha256HexUtf8("obp-networked-demo-v1"),
  });

  const serverBootstrap: ObpServerBootstrap = {
    responder: await exportJwkPair(rKeys),
  };

  const clientBootstrap: ObpClientBootstrap = {
    initiator: await exportJwkPair(iKeys),
    parties: [rParty, iParty],
    init,
    serverActorHex: rSigner.actor,
    inviteToken: await signInvite(init, rSigner),
  };

  for (const p of [serverOutPath, clientOutPath]) {
    await mkdir(dirname(p), { recursive: true });
  }
  await writeFile(serverOutPath, `${JSON.stringify(serverBootstrap, null, 2)}\n`, "utf-8");
  await writeFile(clientOutPath, `${JSON.stringify(clientBootstrap, null, 2)}\n`, "utf-8");

  return { server: serverBootstrap, client: clientBootstrap };
}

const serverPath = resolve(
  process.cwd(),
  process.env.OBP_DEMO_SERVER_BOOTSTRAP ?? ".obp-demo-server.local.json",
);
const clientPath = resolve(
  process.cwd(),
  process.env.OBP_DEMO_CLIENT_BOOTSTRAP ?? ".obp-demo-client.local.json",
);

if (import.meta.main) {
  await writeDemoBootstrap(serverPath, clientPath);
  console.log(`Wrote server bootstrap  → ${serverPath}`);
  console.log(`Wrote client bootstrap  → ${clientPath}`);
}
