/**
 * OBP demo client. Connects to the server, runs one negotiation chain, then exits.
 * Auth: presents an invite token signed by the server's Ed25519 key.
 *
 * Env: OBP_URL (default http://127.0.0.1:8765), OBP_DEMO_CLIENT_BOOTSTRAP
 */

import { connectObpSession } from "@cfd/obp-client";
import { createEd25519FrameVerifier } from "@cfd/obp-core";
import { FakeObpPersistence } from "@cfd/obp-core/testing";
import { initiatorSignerFromBootstrap, loadClientBootstrapFile } from "./load-bootstrap.ts";

const bootstrap = await loadClientBootstrapFile();
const signer = await initiatorSignerFromBootstrap(bootstrap);
const verifier = createEd25519FrameVerifier();

let seq = 0;
const persistence = new FakeObpPersistence(() => ++seq);
persistence.importState({
  parties: bootstrap.parties,
  offers: [],
  ports: [],
  extendsRows: [],
  exposesRows: [],
  bindRows: [],
});

const url = process.env.OBP_URL ?? "http://127.0.0.1:8765";

const { sessionOps } = await connectObpSession(
  {
    url,
    // Invite token is signed by the server's OBP key — no shared secret on the wire.
    requestHeaders: { authorization: `Bearer ${bootstrap.inviteToken}` },
    signer,
    verifier,
    persistence,
    ledgerSeq: () => ++seq,
  },
  async (conn) => {
    const done = new Promise<void>((resolve) => {
      conn
        .init(bootstrap.init, {
          async onIncomingOffer(body) {
            console.log("[client] offer:", body.offerId, body.bindPortId ?? "");
            if (body.ports?.some((p) => p.id === "go")) {
              return {
                offerId: "",
                offerType: "obp.frame.bind",
                bindPortId: "go",
                counterparty_bind: {},
              };
            }
            return null;
          },
          async onTerminate(_reason, _code, chain) {
            console.log("[client] chain terminated:", chain.sessionId);
            resolve();
          },
        })
        .then(async (chain) => {
          await chain.sendTurn({
            offerId: "hello",
            offerType: "obp.demo",
            ports: [{ id: "to-server", isTerminal: false }],
          });
        });
    });
    await done;
  },
);

console.log(`[client] done. ops: ${sessionOps.length}`);
