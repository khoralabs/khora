import { test } from "bun:test";
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
  let s1 = 0;
  let s2 = 0;
  const ledgerSeqSrv = () => ++s1;
  const ledgerSeqCli = () => ++s2;
  const persistenceSrv = new FakeObpPersistence(ledgerSeqSrv);
  const persistenceCli = new FakeObpPersistence(ledgerSeqCli);
  const sp = persistenceSrv.registerParty({ name: "srv", sourcemaps: [] }).party;
  const cp = persistenceSrv.registerParty({ name: "cli", sourcemaps: [] }).party;
  persistenceCli.importState({
    parties: [structuredClone(sp), structuredClone(cp)],
    offers: [],
    ports: [],
    extendsRows: [],
    exposesRows: [],
    bindRows: [],
  });

  const srvKeys = await generateEd25519KeyPair();
  const cliKeys = await generateEd25519KeyPair();
  const srvSigner = await createEd25519FrameSigner(srvKeys.privateKey, srvKeys.publicKey);
  const cliSigner = await createEd25519FrameSigner(cliKeys.privateKey, cliKeys.publicKey);
  const verifier = createEd25519FrameVerifier();

  const genesis = await sha256HexUtf8("e2e-http2");
  const init: SessionInit = {
    session_id: "http2-e2e",
    parties: [
      { id: sp.id, pubkey: srvSigner.actor },
      { id: cp.id, pubkey: cliSigner.actor },
    ],
    genesis_hash: genesis,
  };

  const handle = await serveObp({
    verifier,
    persistence: persistenceSrv,
    ledgerSeq: ledgerSeqSrv,
    onConnect: async () => ({ init, signer: srvSigner }),
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
    sendInit: true,
    channel: clientChannel,
    signer: cliSigner,
    verifier,
    persistence: persistenceCli,
    ledgerSeq: ledgerSeqCli,
    init,
    handlers: {
      async onSessionReady(session) {
        await session.sendTurn({ offerId: "open", offerType: "obp.frame", ports: [] });
      },
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

test("HTTP/2 reference server: bootstrap genesis uses assigned port", async () => {
  let s1 = 0;
  let s2 = 0;
  const ledgerSeqSrv = () => ++s1;
  const ledgerSeqCli = () => ++s2;
  const persistenceSrv = new FakeObpPersistence(ledgerSeqSrv);
  const persistenceCli = new FakeObpPersistence(ledgerSeqCli);
  const sp = persistenceSrv.registerParty({ name: "srv", sourcemaps: [] }).party;
  const cp = persistenceSrv.registerParty({ name: "cli", sourcemaps: [] }).party;
  persistenceCli.importState({
    parties: [structuredClone(sp), structuredClone(cp)],
    offers: [],
    ports: [],
    extendsRows: [],
    exposesRows: [],
    bindRows: [],
  });
  const verifier = createEd25519FrameVerifier();

  const srvKeys = await generateEd25519KeyPair();
  const srvSigner = await createEd25519FrameSigner(srvKeys.privateKey, srvKeys.publicKey);

  const cliKeys = await generateEd25519KeyPair();
  const cliSigner = await createEd25519FrameSigner(cliKeys.privateKey, cliKeys.publicKey);

  const handle = await serveObp({
    verifier,
    persistence: persistenceSrv,
    ledgerSeq: ledgerSeqSrv,
    onConnect: async ({ serverPort }) => {
      const genesis_hash = await sha256HexUtf8(`e2e-bootstrap-${serverPort}`);
      const streamInit: SessionInit = {
        session_id: "bootstrap-port-0",
        parties: [
          { id: sp.id, pubkey: srvSigner.actor },
          { id: cp.id, pubkey: cliSigner.actor },
        ],
        genesis_hash,
      };
      return { init: streamInit, signer: srvSigner };
    },
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

  const streamInit: SessionInit = {
    session_id: "bootstrap-port-0",
    parties: [
      { id: sp.id, pubkey: srvSigner.actor },
      { id: cp.id, pubkey: cliSigner.actor },
    ],
    genesis_hash: await sha256HexUtf8(`e2e-bootstrap-${handle.port}`),
  };

  const clientChannel: FrameChannel = await new Promise((resolve, reject) => {
    const client = http2.connect(`http://127.0.0.1:${handle.port}`);
    client.on("error", reject);
    const req = client.request({ ":method": "POST", ":path": "/obp/v1" });
    req.on("error", reject);
    resolve(frameChannelFromClientStream(req, () => client.close()));
  });

  await runFrameSession({
    sendInit: true,
    channel: clientChannel,
    signer: cliSigner,
    verifier,
    persistence: persistenceCli,
    ledgerSeq: ledgerSeqCli,
    init: streamInit,
    handlers: {
      async onSessionReady(session) {
        await session.sendTurn({ offerId: "open", offerType: "obp.frame", ports: [] });
      },
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
