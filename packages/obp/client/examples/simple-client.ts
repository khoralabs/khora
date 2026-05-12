/**
 * Self-contained demo: ephemeral `serveObp` + `connectObpSession`.
 *   bun run example:client
 */
import {
  createEd25519FrameSigner,
  createEd25519FrameVerifier,
  generateEd25519KeyPair,
  type SessionInit,
  sha256HexUtf8,
} from "@khoralabs/obp-core";
import { FakeObpPersistence } from "@khoralabs/obp-core/testing";
import { serveObp } from "@khoralabs/obp-server";
import { connectObpSession } from "../src/connect.ts";

const EXAMPLE_AUTH = "Bearer obp-example-session";
const EXAMPLE_SESSION_ID = "obp-example";

let seq = 0;
const ledgerSeq = () => ++seq;
const persistence = new FakeObpPersistence(ledgerSeq);
const sp = persistence.registerParty({ name: "srv", sourcemaps: [] }).party;
const cp = persistence.registerParty({ name: "cli", sourcemaps: [] }).party;
const verifier = createEd25519FrameVerifier();

const srvKeys = await generateEd25519KeyPair();
const srvSigner = await createEd25519FrameSigner(srvKeys.privateKey, srvKeys.publicKey);
const cliKeys = await generateEd25519KeyPair();
const cliSigner = await createEd25519FrameSigner(cliKeys.privateKey, cliKeys.publicKey);

const listenHost = "127.0.0.1";

const handle = await serveObp({
  verifier,
  persistence,
  ledgerSeq,
  onConnect: async ({ headers, serverHost, serverPort }) => {
    if (headers.authorization !== EXAMPLE_AUTH) throw new Error("unauthorized");
    const genesis_hash = await sha256HexUtf8(`obp-example-${serverHost}-${serverPort}`);
    return {
      init: {
        session_id: EXAMPLE_SESSION_ID,
        parties: [
          { id: sp.id, pubkey: srvSigner.actor },
          { id: cp.id, pubkey: cliSigner.actor },
        ],
        genesis_hash,
      },
      signer: srvSigner,
    };
  },
  listen: { host: listenHost, port: 0 },
  async onIncomingOffer(body, session) {
    if (body.bindPortId === "main") {
      console.log("server saw bind:", body.bindPortId);
      await session.terminate("ok");
      return null;
    }
    return {
      offerId: "hello",
      offerType: "obp.frame",
      ports: [{ id: "main", isTerminal: false }],
    };
  },
  async onTerminate(reason) {
    console.log("server terminate:", reason);
  },
});

const init: SessionInit = {
  session_id: EXAMPLE_SESSION_ID,
  parties: [
    { id: sp.id, pubkey: srvSigner.actor },
    { id: cp.id, pubkey: cliSigner.actor },
  ],
  genesis_hash: await sha256HexUtf8(`obp-example-${listenHost}-${handle.port}`),
};

const { sessionOps, checkpoint } = await connectObpSession(
  {
    url: `http://${listenHost}:${handle.port}`,
    requestHeaders: { authorization: EXAMPLE_AUTH },
    signer: cliSigner,
    verifier,
    persistence,
    ledgerSeq,
  },
  async (conn) => {
    const chain = await conn.init(init, {
      async onIncomingOffer(body) {
        console.log("client inbound offer:", body.offerId);
        if (body.offerId === "hello" && body.ports?.some((p) => p.id === "main")) {
          return {
            offerId: "",
            offerType: "obp.frame.bind",
            bindPortId: "main",
            counterparty_bind: {},
          };
        }
        return null;
      },
    });
    await chain.sendTurn({ offerId: "open", offerType: "obp.frame", ports: [] });
  },
);

await handle.close();

console.log(
  "sessionOps:",
  sessionOps.length,
  sessionOps.map((o) => o.kind),
);
console.log("checkpoint:", checkpoint);
