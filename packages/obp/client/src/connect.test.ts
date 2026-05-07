import { expect, test } from "bun:test";
import {
  applySessionOps,
  createEd25519FrameSigner,
  createEd25519FrameVerifier,
  generateEd25519KeyPair,
  OBPPersistenceClient,
  type SessionInit,
  sha256HexUtf8,
} from "@cfd/obp-core";
import { FakeObpPersistence } from "@cfd/obp-core/testing";
import { serveObp } from "@cfd/obp-server";
import { checkpointFromOps, verifyExtends } from "@cfd/obp-session-sync";
import { connectObpSession } from "./connect.ts";

async function runTurnSessionCheckpoint(sessionEnvelopeSync: boolean) {
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

  const genesis = await sha256HexUtf8(
    sessionEnvelopeSync ? "e2e-obp-client-sync" : "e2e-obp-client",
  );
  const init: SessionInit = {
    session_id: sessionEnvelopeSync ? "client-pkg-e2e-sync" : "client-pkg-e2e",
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
    sessionEnvelopeSync,
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

  const { sessionOps, checkpoint } = await connectObpSession({
    url: `http://127.0.0.1:${handle.port}`,
    signer: cliSigner,
    verifier,
    persistence,
    ledgerSeq,
    init,
    sessionEnvelopeSync,
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

  expect(checkpoint.seq).toBe(sessionOps.length);
  expect(checkpoint).toEqual(checkpointFromOps(sessionOps));

  const v = verifyExtends({ baseOps: [], deltaOps: sessionOps, claimed: checkpoint });
  expect(v.ok).toBe(true);
  expect(sessionOps.filter((o) => o.kind === "turn").length).toBeGreaterThanOrEqual(2);
  expect(sessionOps.some((o) => o.kind === "terminate")).toBe(true);

  const liveSnap = persistence.exportState();
  let seq2 = 0;
  const persistenceReplay = new FakeObpPersistence(() => ++seq2);
  persistenceReplay.importState({
    parties: liveSnap.parties,
    offers: [],
    ports: [],
    extendsRows: [],
    exposesRows: [],
    bindRows: [],
  });
  const replayClient = new OBPPersistenceClient(persistenceReplay, { ledgerSeq: () => ++seq2 });
  applySessionOps(replayClient, init, sessionOps);
  expect(persistenceReplay.listBinds().length).toBe(persistence.listBinds().length);
  expect(persistenceReplay.isPortExposed("go")).toBe(true);
}

test("connectObpSession: turn session + checkpoint", async () => {
  await runTurnSessionCheckpoint(false);
});

test("connectObpSession: sessionEnvelopeSync multiplex on same stream", async () => {
  await runTurnSessionCheckpoint(true);
});

test("connectObpSession: sessionEnvelopeSync multi-turn (two offers, split persistence)", async () => {
  let s1 = 0;
  let s2 = 0;
  const pSrv = new FakeObpPersistence(() => ++s1);
  const pCli = new FakeObpPersistence(() => ++s2);
  const sp = pSrv.registerParty({ name: "srv", sourcemaps: [] }).party;
  const cp = pSrv.registerParty({ name: "cli", sourcemaps: [] }).party;
  pCli.importState({
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
  const genesis = await sha256HexUtf8("e2e-obp-client-sync-2t");
  const init: SessionInit = {
    session_id: "client-pkg-e2e-sync-2t",
    party_ids: [sp.id, cp.id],
    actor_pubkeys: [srvSigner.actor, cliSigner.actor],
    genesis_hash: genesis,
  };
  const handle = await serveObp({
    signer: srvSigner,
    verifier,
    persistence: pSrv,
    ledgerSeq: () => ++s1,
    init,
    listen: { host: "127.0.0.1", port: 0 },
    sessionEnvelopeSync: true,
    graphApplyOutbound: true,
    async onIncomingOffer(body, session) {
      if (body.bindPortId === "p2") {
        await session.terminate("ok");
        return null;
      }
      if (body.bindPortId === "p1") {
        return {
          offerId: "t2",
          offerType: "obp.frame",
          ports: [{ id: "p2", isTerminal: false }],
        };
      }
      return {
        offerId: "t1",
        offerType: "obp.frame",
        ports: [{ id: "p1", isTerminal: false }],
      };
    },
  });
  const { sessionOps, checkpoint } = await connectObpSession({
    url: `http://127.0.0.1:${handle.port}`,
    signer: cliSigner,
    verifier,
    persistence: pCli,
    ledgerSeq: () => ++s2,
    init,
    sessionEnvelopeSync: true,
    graphApplyOutbound: true,
    initialTurn: { offerId: "open", offerType: "obp.frame", ports: [] },
    handlers: {
      async onIncomingOffer(body) {
        if (body.offerId === "t1" && body.ports?.some((p) => p.id === "p1")) {
          return {
            offerId: "",
            offerType: "obp.frame.bind",
            bindPortId: "p1",
            counterparty_bind: {},
          };
        }
        if (body.offerId === "t2" && body.ports?.some((p) => p.id === "p2")) {
          return {
            offerId: "",
            offerType: "obp.frame.bind",
            bindPortId: "p2",
            counterparty_bind: {},
          };
        }
        throw new Error(`unexpected offer ${body.offerId}`);
      },
    },
  });
  await handle.close();
  expect(sessionOps.length).toBeGreaterThanOrEqual(5);
  const v = verifyExtends({ baseOps: [], deltaOps: sessionOps, claimed: checkpoint });
  expect(v.ok).toBe(true);
});

test("connectObpSession: two frame chains on one HTTP/2 stream (multiplex)", async () => {
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

  const genesis = await sha256HexUtf8("e2e-obp-multiplex-a");
  const init: SessionInit = {
    session_id: "mux-a",
    party_ids: [sp.id, cp.id],
    actor_pubkeys: [srvSigner.actor, cliSigner.actor],
    genesis_hash: genesis,
  };
  const genesisB = await sha256HexUtf8("e2e-obp-multiplex-b");
  const initB: SessionInit = {
    session_id: "mux-b",
    party_ids: [sp.id, cp.id],
    actor_pubkeys: [srvSigner.actor, cliSigner.actor],
    genesis_hash: genesisB,
  };

  const handle = await serveObp({
    signer: srvSigner,
    verifier,
    persistence,
    ledgerSeq,
    init,
    multiplex: true,
    listen: { host: "127.0.0.1", port: 0 },
    async onIncomingOffer(body, session) {
      if (body.offerId === "m-a") {
        await session.terminate("a");
        return null;
      }
      if (body.offerId === "m-b") {
        await session.terminate("b");
        return null;
      }
      return null;
    },
  });

  const { sessionOps, checkpoint } = await connectObpSession({
    url: `http://127.0.0.1:${handle.port}`,
    signer: cliSigner,
    verifier,
    persistence,
    ledgerSeq,
    init,
    multiplex: true,
    initiatorChainPlans: [
      { init, initialTurn: { offerId: "m-a", offerType: "obp.frame", ports: [] } },
      { init: initB, initialTurn: { offerId: "m-b", offerType: "obp.frame", ports: [] } },
    ],
  });

  await handle.close();

  expect(sessionOps.every((o) => o.session_id !== undefined && o.session_id !== "")).toBe(true);
  expect(sessionOps.some((o) => o.session_id === init.session_id)).toBe(true);
  expect(sessionOps.some((o) => o.session_id === initB.session_id)).toBe(true);
  const v = verifyExtends({ baseOps: [], deltaOps: sessionOps, claimed: checkpoint });
  expect(v.ok).toBe(true);
});
