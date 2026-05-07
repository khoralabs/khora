import { expect, test } from "bun:test";
import http2 from "node:http2";
import {
  createEd25519FrameSigner,
  createEd25519FrameVerifier,
  type FrameChannel,
  generateEd25519KeyPair,
  runFrameSession,
  type SessionInit,
  sha256HexUtf8,
} from "@cfd/obp-core";
import { FakeObpPersistence } from "@cfd/obp-core/testing";
import { frameChannelFromClientStream } from "./http2-channel.ts";
import { serveObp } from "./serve.ts";

test("HTTP/2 reference server: turn session", async () => {
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

  const genesis = await sha256HexUtf8("e2e-http2");
  const init: SessionInit = {
    session_id: "http2-e2e",
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
      if (body.bindPortId === "go") {
        await session.terminate("ok");
        return null;
      }
      return {
        offerId: "greeting",
        offerType: "obp.frame",
        ports: [{ id: "go", isTerminal: false }],
      };
    },
  });

  const clientChannel: FrameChannel = await new Promise((resolve, reject) => {
    const client = http2.connect(`http://127.0.0.1:${handle.port}`);
    client.on("error", reject);
    const req = client.request({ ":method": "POST", ":path": "/obp/v1" });
    req.on("error", reject);
    resolve(frameChannelFromClientStream(req, () => client.close()));
  });

  await runFrameSession({
    role: "initiator",
    channel: clientChannel,
    signer: cliSigner,
    verifier,
    persistence,
    ledgerSeq,
    init,
    initialTurn: { offerId: "open", offerType: "obp.frame", ports: [] },
    handlers: {
      async onIncomingOffer(body) {
        if (body.offerId === "greeting" && body.ports?.some((p) => p.id === "go")) {
          return {
            offerId: "",
            offerType: "obp.frame.bind",
            bindPortId: "go",
            counterparty_bind: {},
          };
        }
        return null;
      },
    },
  });

  await handle.close();
});
