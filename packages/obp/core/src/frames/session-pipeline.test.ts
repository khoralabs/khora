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
  const genesis = await sha256HexUtf8("session-genesis");
  const init: SessionInit = {
    session_id: "sid",
    party_ids: [sp.id, cp.id],
    actor_pubkeys: [srvSigner.actor, cliSigner.actor],
    genesis_hash: genesis,
  };
  const [serverCh, clientCh] = createMemoryFrameChannelPair();
  return {
    persistence,
    srvSigner,
    cliSigner,
    verifier,
    init,
    genesis,
    serverCh,
    clientCh,
    ledgerSeq,
  };
}

test("bilateral frame session: symmetric turns (expose then bind)", async () => {
  const ctx = await setupPair();
  let bindCount = 0;
  const serverP = runFrameSession({
    role: "responder",
    channel: ctx.serverCh,
    signer: ctx.srvSigner,
    verifier: ctx.verifier,
    persistence: ctx.persistence,
    ledgerSeq: ctx.ledgerSeq,
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
    role: "initiator",
    channel: ctx.clientCh,
    signer: ctx.cliSigner,
    verifier: ctx.verifier,
    persistence: ctx.persistence,
    ledgerSeq: ctx.ledgerSeq,
    init: ctx.init,
    initialTurn: { offerId: "knock", offerType: "obp.frame", ports: [] },
    handlers: {
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

test("multiplex: two chains on one memory channel (p_hash routing)", async () => {
  const ctx = await setupPair();
  const genesisB = await sha256HexUtf8("session-genesis-b");
  const initB: SessionInit = {
    session_id: "sid-b",
    party_ids: ctx.init.party_ids,
    actor_pubkeys: ctx.init.actor_pubkeys,
    genesis_hash: genesisB,
  };

  const serverP = runFrameMultiplexSession({
    role: "responder",
    channel: ctx.serverCh,
    signer: ctx.srvSigner,
    verifier: ctx.verifier,
    persistence: ctx.persistence,
    ledgerSeq: ctx.ledgerSeq,
    sessionTemplate: {
      party_ids: ctx.init.party_ids,
      actor_pubkeys: ctx.init.actor_pubkeys,
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
    role: "initiator",
    channel: ctx.clientCh,
    signer: ctx.cliSigner,
    verifier: ctx.verifier,
    persistence: ctx.persistence,
    ledgerSeq: ctx.ledgerSeq,
    sessionTemplate: {
      party_ids: ctx.init.party_ids,
      actor_pubkeys: ctx.init.actor_pubkeys,
    },
    initiatorChainPlans: [
      {
        init: ctx.init,
        initialTurn: { offerId: "chain-a", offerType: "obp.frame", ports: [] },
      },
      {
        init: initB,
        initialTurn: { offerId: "chain-b", offerType: "obp.frame", ports: [] },
      },
    ],
    handlers: {},
  });

  const [sOps, cOps] = await Promise.all([serverP, clientP]);
  expect(cOps.some((o) => o.session_id === ctx.init.session_id)).toBe(true);
  expect(cOps.some((o) => o.session_id === initB.session_id)).toBe(true);
  expect(cOps.some((o) => o.kind === "terminate")).toBe(true);
  expect(sOps.length).toBeGreaterThan(0);
  expect(cOps.length).toBeGreaterThan(0);
});
