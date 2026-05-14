import { describe, expect, test } from "bun:test";
import { createMemoryDuplexByteStreamPair } from "@khoralabs/duplex-byte-stream";
import {
  createEd25519FrameSigner,
  createEd25519FrameVerifier,
  generateEd25519KeyPair,
  runFrameMultiplexSession,
  type SessionInit,
  sha256HexUtf8,
} from "@khoralabs/obp-core";
import type { ObpPersistence } from "@khoralabs/obp-persistence-client";
import { FakeObpPersistence } from "@khoralabs/obp-core/testing";
import { connectObpFrameChannelSession } from "./connect-websocket.ts";

async function setupPersistencePair(): Promise<{
  persistenceSrv: ObpPersistence;
  persistenceCli: ObpPersistence;
  srvSigner: Awaited<ReturnType<typeof createEd25519FrameSigner>>;
  cliSigner: Awaited<ReturnType<typeof createEd25519FrameSigner>>;
  verifier: ReturnType<typeof createEd25519FrameVerifier>;
  init: SessionInit;
  ledgerSeqSrv: () => number;
  ledgerSeqCli: () => number;
}> {
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
  const genesis = await sha256HexUtf8("frame-channel-client-test");
  const init: SessionInit = {
    session_id: "fc-mux",
    parties: [
      { id: sp.id, pubkey: srvSigner.actor },
      { id: cp.id, pubkey: cliSigner.actor },
    ],
    genesis_hash: genesis,
  };
  return {
    persistenceSrv,
    persistenceCli,
    srvSigner,
    cliSigner,
    verifier,
    init,
    ledgerSeqSrv,
    ledgerSeqCli,
  };
}

describe("connectObpFrameChannelSession", () => {
  test("multiplex over paired FrameChannels (same semantics as WebSocket relay)", async () => {
    const ctx = await setupPersistencePair();
    const [serverCh, clientCh] = createMemoryDuplexByteStreamPair();

    const serverP = runFrameMultiplexSession({
      channel: serverCh,
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

    const clientP = connectObpFrameChannelSession(
      {
        channel: clientCh,
        signer: ctx.cliSigner,
        verifier: ctx.verifier,
        persistence: ctx.persistenceCli,
        ledgerSeq: ctx.ledgerSeqCli,
      },
      async (conn) => {
        const chain = await conn.init(ctx.init, {});
        await Promise.all([
          chain.sendTurn({ offerId: "concurrent-a", offerType: "obp.frame", ports: [] }),
          chain.sendTurn({ offerId: "concurrent-b", offerType: "obp.frame", ports: [] }),
        ]);
        await chain.terminate("done");
      },
    );

    const [sOps, { sessionOps: cOps }] = await Promise.all([serverP, clientP]);
    expect(cOps.filter((o) => o.kind === "turn").length).toBeGreaterThanOrEqual(2);
    expect(cOps.some((o) => o.kind === "terminate")).toBe(true);
    expect(sOps.length).toBeGreaterThan(0);
  });
});
