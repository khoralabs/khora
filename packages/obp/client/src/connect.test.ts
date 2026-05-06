import { expect, test } from "bun:test";
import {
  createEd25519FrameSigner,
  createEd25519FrameVerifier,
  generateEd25519KeyPair,
  type SessionInit,
  sha256HexUtf8,
} from "@cfd/obp-core";
import { FakeObpPersistence } from "@cfd/obp-core/testing";
import { serveObp } from "@cfd/obp-server";
import { checkpointFromOps, verifyExtends } from "@cfd/obp-session-sync";
import { connectObpSession } from "./connect.ts";

test("connectObpSession: proliferate + resolve + checkpoint", async () => {
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

  const genesis = await sha256HexUtf8("e2e-obp-client");
  const init: SessionInit = {
    session_id: "client-pkg-e2e",
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
});
