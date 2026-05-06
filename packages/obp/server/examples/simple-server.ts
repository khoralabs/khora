/**
 * Minimal HTTP/2 OBP frame server (h2c). Run:
 *   bun run examples/simple-server.ts
 *
 * Initiator: use `@cfd/obp-client` `connectObpSession` with the same `SessionInit`
 * (printed `client_actor`, `genesis_hash`, party ids) or run `bun run example:client`
 * in `packages/obp/client` for a self-contained demo.
 */
import {
  createEd25519FrameSigner,
  generateEd25519KeyPair,
  type SessionInit,
  sha256HexUtf8,
} from "@cfd/obp-core";
import { FakeObpPersistence } from "@cfd/obp-core/testing";
import { serveObp } from "../src/serve.ts";

const host = process.env.OBP_HOST ?? "127.0.0.1";
const port = Number(process.env.OBP_PORT ?? "8765");

let seq = 0;
const ledgerSeq = () => ++seq;
const persistence = new FakeObpPersistence(ledgerSeq);
const serverParty = persistence.registerParty({ name: "server", sourcemaps: [] }).party;
const clientParty = persistence.registerParty({ name: "client", sourcemaps: [] }).party;

const srvKeys = await generateEd25519KeyPair();
const cliKeys = await generateEd25519KeyPair();
const signer = await createEd25519FrameSigner(srvKeys.privateKey, srvKeys.publicKey);
const cliSigner = await createEd25519FrameSigner(cliKeys.privateKey, cliKeys.publicKey);

const genesisHash = await sha256HexUtf8(`simple-server-${host}-${port}`);
const init: SessionInit = {
  session_id: "example-session",
  party_ids: [serverParty.id, clientParty.id],
  actor_pubkeys: [signer.actor, cliSigner.actor],
  genesis_hash: genesisHash,
};

const handle = await serveObp({
  signer,
  persistence,
  ledgerSeq,
  init,
  listen: { host, port },
  async onConnect(session) {
    console.log("session connected");
    await session.expose({
      offerId: "hello",
      ports: [{ id: "main", isTerminal: false }],
    });
  },
  async onBind(portId) {
    console.log("bind", portId);
  },
  async onTerminate(reason) {
    console.log("terminate", reason);
  },
});

console.log(`OBP frame server listening on http://${host}:${handle.port} (POST /obp/v1)`);
console.log("SessionInit hints:", {
  genesis_hash: genesisHash,
  session_id: init.session_id,
  party_ids: init.party_ids,
  server_actor: signer.actor,
  client_actor: cliSigner.actor,
});
