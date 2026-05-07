/**
 * Demo client: runs two OBP chains on one HTTP/2 POST stream (frame multiplex), then closes.
 *
 * Env: OBP_URL (default http://127.0.0.1:8765), OBP_DEMO_BOOTSTRAP
 */

import { connectObpSession } from "@cfd/obp-client";
import { createEd25519FrameVerifier, type SessionInit, sha256HexUtf8 } from "@cfd/obp-core";
import { FakeObpPersistence } from "@cfd/obp-core/testing";
import { checkpointFromOps, verifyExtends } from "@cfd/obp-session-sync";
import { demoCounterpartyPayload, demoRound1, demoRound2 } from "./demo-protocol.ts";
import { initiatorSignerFromBootstrap, loadBootstrapFile } from "./load-bootstrap.ts";

const bootstrap = await loadBootstrapFile();
const signer = await initiatorSignerFromBootstrap(bootstrap);
const verifier = createEd25519FrameVerifier();

let seq = 0;
const ledgerSeq = () => ++seq;
const persistence = new FakeObpPersistence(ledgerSeq);
persistence.importState({
  parties: bootstrap.parties,
  offers: [],
  ports: [],
  extendsRows: [],
  exposesRows: [],
  bindRows: [],
});

const url = process.env.OBP_URL ?? "http://127.0.0.1:8765";

const initRound2: SessionInit = {
  ...bootstrap.init,
  session_id: `${bootstrap.init.session_id}-r2`,
  genesis_hash: await sha256HexUtf8(
    `obp-demo-r2:${bootstrap.init.session_id}:${bootstrap.init.genesis_hash}`,
  ),
};

const bindReply = (portId: string) => ({
  offerId: "",
  offerType: "obp.frame.bind" as const,
  bindPortId: portId,
  counterparty_bind: demoCounterpartyPayload(),
});

const { sessionOps, checkpoint } = await connectObpSession({
  url,
  signer,
  verifier,
  persistence,
  ledgerSeq,
  init: bootstrap.init,
  multiplex: true,
  initiatorChainPlans: [
    {
      init: bootstrap.init,
      initialTurn: {
        offerId: demoRound1.clientOffer,
        offerType: "obp.demo",
        ports: [{ id: demoRound1.clientPort, isTerminal: false, max_bindings: 8 }],
      },
    },
    {
      init: initRound2,
      initialTurn: {
        offerId: demoRound2.clientOffer,
        offerType: "obp.demo",
        ports: [{ id: demoRound2.clientPort, isTerminal: false, max_bindings: 8 }],
      },
    },
  ],
  sessionEnvelopeSync: true,
  graphApplyOutbound: true,
  handlers: {
    async onIncomingOffer(body) {
      for (const r of [demoRound1, demoRound2]) {
        if (body.offerId === r.turn1.offerId && body.ports?.some((p) => p.id === r.turn1.portId)) {
          return bindReply(r.turn1.portId);
        }
        if (body.offerId === r.turn2.offerId && body.ports?.some((p) => p.id === r.turn2.portId)) {
          return bindReply(r.turn2.portId);
        }
      }
      throw new Error(`unexpected offer ${body.offerId}`);
    },
    async onTerminate(_reason, _code, sessionId) {
      console.log("[demo] chain done:", sessionId ?? "");
    },
  },
});

const v = verifyExtends({ baseOps: [], deltaOps: sessionOps, claimed: checkpoint });
if (!v.ok) {
  throw new Error("checkpoint verify failed after session");
}

console.log("[demo] both chains complete on one HTTP/2 stream");
console.log(
  "ops:",
  sessionOps.length,
  "checkpoint seq:",
  checkpoint.seq,
  "root:",
  `${checkpoint.root_hex.slice(0, 16)}…`,
);
console.log(
  "local checkpointFromOps match:",
  checkpointFromOps(sessionOps).root_hex === checkpoint.root_hex,
);
