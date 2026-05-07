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
} from "@cfd/obp-core";
import { FakeObpPersistence } from "@cfd/obp-core/testing";
import { serveObp } from "@cfd/obp-server";
import { connectObpSession } from "../src/connect.ts";

let seq = 0;
const ledgerSeq = () => ++seq;
const persistence = new FakeObpPersistence(ledgerSeq);
const sp = persistence.registerParty({ name: "srv", sourcemaps: [] }).party;
const cp = persistence.registerParty({ name: "cli", sourcemaps: [] }).party;

const srvKeys = await generateEd25519KeyPair();
const cliKeys = await generateEd25519KeyPair();
const srvSigner = await createEd25519FrameSigner(srvKeys.privateKey, srvKeys.publicKey);
const cliSigner = await createEd25519FrameSigner(cliKeys.privateKey, cliKeys.publicKey);
const verifier = createEd25519FrameVerifier();

const genesis = await sha256HexUtf8("example-client");
const init: SessionInit = {
  session_id: "example-client",
  party_ids: [sp.id, cp.id],
  actor_pubkeys: [srvSigner.actor, cliSigner.actor],
  genesis_hash: genesis,
};

const handle = await serveObp({
  signer: srvSigner,
  verifier,
  persistence,
  ledgerSeq,
  init,
  listen: { host: "127.0.0.1", port: 0 },
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

const { sessionOps, checkpoint } = await connectObpSession({
  url: `http://127.0.0.1:${handle.port}`,
  signer: cliSigner,
  verifier,
  persistence,
  ledgerSeq,
  init,
  initialTurn: { offerId: "open", offerType: "obp.frame", ports: [] },
  handlers: {
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
  },
});

await handle.close();

console.log(
  "sessionOps:",
  sessionOps.length,
  sessionOps.map((o) => o.kind),
);
console.log("checkpoint:", checkpoint);
