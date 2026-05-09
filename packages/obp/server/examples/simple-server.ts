/**
 * Minimal HTTP/2 OBP frame server (h2c). Run:
 *   bun run examples/simple-server.ts
 *
 * Pairing: send `Authorization: Bearer obp-example-session` on POST `/obp/v1`.
 * `SessionInit` must match responder **`parties`** (ordered **[server, client]** by id + pubkey) and
 * `genesis_hash = sha256HexUtf8("obp-example-<listenHost>-<listenPort>")`.
 * Full loop in one repo: `bun run example:client` under `packages/obp/client`.
 */
import { createEd25519FrameSigner, generateEd25519KeyPair, sha256HexUtf8 } from "@cfd/obp-core";
import { FakeObpPersistence } from "@cfd/obp-core/testing";
import { serveObp } from "../src/serve.ts";

const EXAMPLE_AUTH = "Bearer obp-example-session";
const EXAMPLE_SESSION_ID = "obp-example";

const host = process.env.OBP_HOST ?? "127.0.0.1";
const port = Number(process.env.OBP_PORT ?? "8765");

let seq = 0;
const ledgerSeq = () => ++seq;
const persistence = new FakeObpPersistence(ledgerSeq);
const serverParty = persistence.registerParty({ name: "server", sourcemaps: [] }).party;
const clientParty = persistence.registerParty({ name: "client", sourcemaps: [] }).party;

const srvKeys = await generateEd25519KeyPair();
const srvSigner = await createEd25519FrameSigner(srvKeys.privateKey, srvKeys.publicKey);
const cliKeys = await generateEd25519KeyPair();
const cliSigner = await createEd25519FrameSigner(cliKeys.privateKey, cliKeys.publicKey);

const handle = await serveObp({
  persistence,
  ledgerSeq,
  onConnect: async ({ headers, serverHost, serverPort }) => {
    if (headers.authorization !== EXAMPLE_AUTH) throw new Error("unauthorized");
    const genesis_hash = await sha256HexUtf8(`obp-example-${serverHost}-${serverPort}`);
    return {
      init: {
        session_id: EXAMPLE_SESSION_ID,
        parties: [
          { id: serverParty.id, pubkey: srvSigner.actor },
          { id: clientParty.id, pubkey: cliSigner.actor },
        ],
        genesis_hash,
      },
      signer: srvSigner,
    };
  },
  listen: { host, port },
  async onIncomingOffer(body, session) {
    if (body.bindPortId === "main") {
      console.log("bind", body.bindPortId);
      await session.terminate("ok");
      return null;
    }
    console.log("session connected (first turn)");
    return {
      offerId: "hello",
      offerType: "obp.frame",
      ports: [{ id: "main", isTerminal: false }],
    };
  },
  async onTerminate(reason) {
    console.log("terminate", reason);
  },
});

console.log(`OBP frame server listening on http://${host}:${handle.port} (POST /obp/v1)`);
console.log("Pair with:", {
  authorization: EXAMPLE_AUTH,
  session_id: EXAMPLE_SESSION_ID,
  parties: [
    { id: serverParty.id, pubkey: srvSigner.actor },
    { id: clientParty.id, pubkey: cliSigner.actor },
  ],
  genesis_seed: `obp-example-${host}-${handle.port}`,
});
