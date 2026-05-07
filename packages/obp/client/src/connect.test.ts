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

async function runProliferateResolveCheckpoint(sessionEnvelopeSync: boolean) {
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
    async onConnect(session) {
      await session.expose({
        offerId: "greeting",
        ports: [{ id: "go", isTerminal: false }],
      });
    },
    async onBind(portId, _p, session) {
      expect(portId).toBe("go");
      await session.terminate("ok");
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
    handlers: {
      async onProliferate(body) {
        expect(body.offerId).toBe("greeting");
        return { portId: "go", payload: {} };
      },
    },
  });

  await handle.close();

  expect(checkpoint.seq).toBe(sessionOps.length);
  expect(checkpoint).toEqual(checkpointFromOps(sessionOps));

  const v = verifyExtends({ baseOps: [], deltaOps: sessionOps, claimed: checkpoint });
  expect(v.ok).toBe(true);
  expect(sessionOps.some((o) => o.kind === "proliferate")).toBe(true);
  expect(sessionOps.some((o) => o.kind === "resolve")).toBe(true);
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

test("connectObpSession: proliferate + resolve + checkpoint", async () => {
  await runProliferateResolveCheckpoint(false);
});

test("connectObpSession: sessionEnvelopeSync multiplex on same stream", async () => {
  await runProliferateResolveCheckpoint(true);
});

test("connectObpSession: sessionEnvelopeSync multi-turn (two proliferates, split persistence)", async () => {
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
    async onConnect(session) {
      await session.expose({
        offerId: "t1",
        ports: [{ id: "p1", isTerminal: false }],
      });
    },
    async onBind(portId, _p, session) {
      if (portId === "p1") {
        await session.expose({
          offerId: "t2",
          ports: [{ id: "p2", isTerminal: false }],
        });
        return;
      }
      await session.terminate("ok");
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
    handlers: {
      async onProliferate(body) {
        if (body.offerId === "t1") return { portId: "p1", payload: {} };
        if (body.offerId === "t2") return { portId: "p2", payload: {} };
        throw new Error(`unexpected ${body.offerId}`);
      },
    },
  });
  await handle.close();
  expect(sessionOps.length).toBeGreaterThanOrEqual(5);
  const v = verifyExtends({ baseOps: [], deltaOps: sessionOps, claimed: checkpoint });
  expect(v.ok).toBe(true);
});
