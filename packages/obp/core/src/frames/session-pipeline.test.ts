import { expect, test } from "bun:test";
import { FakeObpPersistence } from "../testing/fake-obp-persistence.ts";
import { createMemoryFrameChannelPair } from "./channel.ts";
import { sha256HexUtf8 } from "./dag.ts";
import { runFrameMultiplexSession, runFrameSession } from "./session-pipeline.ts";
import {
  createEd25519FrameSigner,
  createEd25519FrameVerifier,
  generateEd25519KeyPair,
} from "./signer.ts";
import type { SessionInit } from "./types.ts";

async function setupPair() {
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
  const genesis = await sha256HexUtf8("session-genesis");
  const init: SessionInit = {
    session_id: "sid",
    parties: [
      { id: sp.id, pubkey: srvSigner.actor },
      { id: cp.id, pubkey: cliSigner.actor },
    ],
    genesis_hash: genesis,
  };
  const [serverCh, clientCh] = createMemoryFrameChannelPair();
  return {
    persistenceSrv,
    persistenceCli,
    srvSigner,
    cliSigner,
    verifier,
    init,
    genesis,
    serverCh,
    clientCh,
    ledgerSeqSrv,
    ledgerSeqCli,
  };
}

test("bilateral frame session: symmetric turns (expose then bind)", async () => {
  const ctx = await setupPair();
  let bindCount = 0;
  const serverP = runFrameSession({
    channel: ctx.serverCh,
    signer: ctx.srvSigner,
    verifier: ctx.verifier,
    persistence: ctx.persistenceSrv,
    ledgerSeq: ctx.ledgerSeqSrv,
    init: ctx.init,
    handlers: {
      async onIncomingOffer(body, session) {
        if (body.bindPortId === "start_order") {
          bindCount += 1;
          await session.terminate("done");
          return null;
        }
        return {
          offerId: "greeting",
          offerType: "obp.frame",
          ports: [{ id: "start_order", isTerminal: false }],
        };
      },
    },
  });

  const clientP = runFrameSession({
    sendInit: true,
    channel: ctx.clientCh,
    signer: ctx.cliSigner,
    verifier: ctx.verifier,
    persistence: ctx.persistenceCli,
    ledgerSeq: ctx.ledgerSeqCli,
    init: ctx.init,
    handlers: {
      async onSessionReady(session) {
        await session.sendTurn({ offerId: "knock", offerType: "obp.frame", ports: [] });
      },
      async onIncomingOffer(body) {
        if (body.offerId === "greeting" && body.ports?.some((p) => p.id === "start_order")) {
          return {
            offerId: "",
            offerType: "obp.frame.bind",
            bindPortId: "start_order",
            counterparty_bind: {},
          };
        }
        return null;
      },
    },
  });

  const [sOps, cOps] = await Promise.all([serverP, clientP]);
  expect(bindCount).toBe(1);
  expect(sOps.length).toBeGreaterThan(0);
  expect(cOps.length).toBeGreaterThan(0);
  await ctx.serverCh.close();
  await ctx.clientCh.close();
});

test("multiplex: concurrent sendTurn on one chain serializes tips (no sibling mints)", async () => {
  const ctx = await setupPair();

  const serverP = runFrameMultiplexSession({
    channel: ctx.serverCh,
    signer: ctx.srvSigner,
    verifier: ctx.verifier,
    persistence: ctx.persistenceSrv,
    ledgerSeq: ctx.ledgerSeqSrv,
    sessionTemplate: { parties: ctx.init.parties },
    initiatorChainPlans: [],
    handlers: {
      async onIncomingOffer() {
        return null;
      },
    },
  });

  const clientP = runFrameMultiplexSession({
    channel: ctx.clientCh,
    signer: ctx.cliSigner,
    verifier: ctx.verifier,
    persistence: ctx.persistenceCli,
    ledgerSeq: ctx.ledgerSeqCli,
    sessionTemplate: { parties: ctx.init.parties },
    handlers: {},
    openerSession: async (api) => {
      const chain = await api.init(ctx.init, {});
      await Promise.all([
        chain.sendTurn({ offerId: "concurrent-a", offerType: "obp.frame", ports: [] }),
        chain.sendTurn({ offerId: "concurrent-b", offerType: "obp.frame", ports: [] }),
      ]);
      await chain.terminate("done");
      api.close();
    },
  });

  const [sOps, cOps] = await Promise.all([serverP, clientP]);
  expect(cOps.filter((o) => o.kind === "turn").length).toBeGreaterThanOrEqual(2);
  expect(cOps.some((o) => o.kind === "terminate")).toBe(true);
  expect(sOps.length).toBeGreaterThan(0);
});

test("multiplex: two chains on one memory channel (p_hash routing)", async () => {
  const ctx = await setupPair();
  const genesisB = await sha256HexUtf8("session-genesis-b");
  const initB: SessionInit = {
    session_id: "sid-b",
    parties: ctx.init.parties,
    genesis_hash: genesisB,
  };

  const serverP = runFrameMultiplexSession({
    channel: ctx.serverCh,
    signer: ctx.srvSigner,
    verifier: ctx.verifier,
    persistence: ctx.persistenceSrv,
    ledgerSeq: ctx.ledgerSeqSrv,
    sessionTemplate: {
      parties: ctx.init.parties,
    },
    initiatorChainPlans: [],
    handlers: {
      async onIncomingOffer(body, session) {
        if (body.offerId === "chain-a") {
          await session.terminate("done-a");
          return null;
        }
        if (body.offerId === "chain-b") {
          await session.terminate("done-b");
          return null;
        }
        return null;
      },
    },
  });

  const clientP = runFrameMultiplexSession({
    channel: ctx.clientCh,
    signer: ctx.cliSigner,
    verifier: ctx.verifier,
    persistence: ctx.persistenceCli,
    ledgerSeq: ctx.ledgerSeqCli,
    sessionTemplate: {
      parties: ctx.init.parties,
    },
    initiatorChainPlans: [{ init: ctx.init }, { init: initB }],
    handlers: {
      async onSessionReady(session) {
        if (session.sessionId === ctx.init.session_id) {
          await session.sendTurn({ offerId: "chain-a", offerType: "obp.frame", ports: [] });
        } else if (session.sessionId === initB.session_id) {
          await session.sendTurn({ offerId: "chain-b", offerType: "obp.frame", ports: [] });
        }
      },
    },
  });

  const [sOps, cOps] = await Promise.all([serverP, clientP]);
  expect(cOps.some((o) => o.session_id === ctx.init.session_id)).toBe(true);
  expect(cOps.some((o) => o.session_id === initB.session_id)).toBe(true);
  expect(cOps.some((o) => o.kind === "terminate")).toBe(true);
  expect(sOps.length).toBeGreaterThan(0);
  expect(cOps.length).toBeGreaterThan(0);
});

test("multiplex: outbound sendTurn failure leaves FrameDag tip unchanged", async () => {
  const ctx = await setupPair();

  const serverP = runFrameMultiplexSession({
    channel: ctx.serverCh,
    signer: ctx.srvSigner,
    verifier: ctx.verifier,
    persistence: ctx.persistenceSrv,
    ledgerSeq: ctx.ledgerSeqSrv,
    sessionTemplate: { parties: ctx.init.parties },
    initiatorChainPlans: [],
    handlers: {
      async onIncomingOffer(_body, session) {
        const tipBefore = session.tipHash;
        await expect(
          session.sendTurn({
            offerId: "bad-bind",
            offerType: "obp.frame.bind",
            bindPortId: "00000000-0000-4000-8000-000000000001",
            counterparty_bind: {},
          }),
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
        expect(session.tipHash).toBe(tipBefore);
        await session.terminate("done");
        return null;
      },
    },
  });

  const clientP = runFrameMultiplexSession({
    channel: ctx.clientCh,
    signer: ctx.cliSigner,
    verifier: ctx.verifier,
    persistence: ctx.persistenceCli,
    ledgerSeq: ctx.ledgerSeqCli,
    sessionTemplate: { parties: ctx.init.parties },
    handlers: {},
    openerSession: async (api) => {
      const chain = await api.init(ctx.init, {});
      await chain.sendTurn({ offerId: "hello", offerType: "obp.frame", ports: [] });
      api.close();
    },
  });

  await Promise.all([serverP, clientP]);
});
