/**
 * Two separate FakeObpPersistence stores (like the networked demo): session must still complete.
 */
import { expect, test } from "bun:test";
import { connectObpSession } from "@cfd/obp-client";
import {
  createEd25519FrameSigner,
  createEd25519FrameVerifier,
  generateEd25519KeyPair,
  sha256HexUtf8,
} from "@cfd/obp-core";
import { FakeObpPersistence } from "@cfd/obp-core/testing";
import { serveObp } from "@cfd/obp-server";

test("two-store HTTP/2 frame session (no shared persistence)", async () => {
  let s1 = 0;
  let s2 = 0;
  const p1 = new FakeObpPersistence(() => ++s1);
  const p2 = new FakeObpPersistence(() => ++s2);
  const sp = p1.registerParty({ name: "srv", sourcemaps: [] }).party;
  const cp = p1.registerParty({ name: "cli", sourcemaps: [] }).party;
  p2.importState({
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
  const genesis = await sha256HexUtf8("two-store-e2e");
  const init = {
    session_id: "two-store",
    party_ids: [sp.id, cp.id] as [string, string],
    actor_pubkeys: [srvSigner.actor, cliSigner.actor] as [string, string],
    genesis_hash: genesis,
  };

  const handle = await serveObp({
    signer: srvSigner,
    verifier,
    persistence: p1,
    ledgerSeq: () => ++s1,
    init,
    listen: { host: "127.0.0.1", port: 0 },
    sessionEnvelopeSync: false,
    graphApplyOutbound: true,
    async onConnect(session) {
      await session.expose({ offerId: "greeting", ports: [{ id: "go", isTerminal: false }] });
    },
    async onBind(_pid, _p, session) {
      await session.terminate("ok");
    },
  });

  const { sessionOps } = await connectObpSession({
    url: `http://127.0.0.1:${handle.port}`,
    signer: cliSigner,
    verifier,
    persistence: p2,
    ledgerSeq: () => ++s2,
    init,
    sessionEnvelopeSync: false,
    graphApplyOutbound: true,
    handlers: {
      async onProliferate(body) {
        expect(body.offerId).toBe("greeting");
        return { portId: "go", payload: {} };
      },
    },
  });

  await handle.close();
  expect(sessionOps.length).toBeGreaterThanOrEqual(3);
});
