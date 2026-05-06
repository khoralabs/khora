import { expect, test } from "bun:test";
import { FakeObpPersistence } from "../testing/fake-obp-persistence.ts";
import { createMemoryFrameChannelPair } from "./channel.ts";
import { sha256HexUtf8 } from "./dag.ts";
import {
  createEd25519FrameSigner,
  createEd25519FrameVerifier,
  generateEd25519KeyPair,
} from "./signer.ts";
import { runFrameSession } from "./session-pipeline.ts";
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

test("bilateral frame session: proliferate then resolve", async () => {
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
      async onConnect(session) {
        await session.expose({
          offerId: "greeting",
          ports: [{ id: "start_order", isTerminal: false }],
        });
      },
      async onBind(portId, _payload, session) {
        bindCount += 1;
        expect(portId).toBe("start_order");
        await session.terminate("done");
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
    handlers: {
      async onProliferate(body, _s) {
        expect(body.offerId).toBe("greeting");
        return { portId: "start_order", payload: {} };
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
