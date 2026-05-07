/**
 * One-shot client: completes one OBP session against the demo server.
 *
 * Env: OBP_URL (default http://127.0.0.1:8765), OBP_DEMO_BOOTSTRAP
 */

import { connectObpSession } from "@cfd/obp-client";
import { createEd25519FrameVerifier } from "@cfd/obp-core";
import { FakeObpPersistence } from "@cfd/obp-core/testing";
import { checkpointFromOps, verifyExtends } from "@cfd/obp-session-sync";
import {
  demoCounterpartyPayload,
  demoTurn1,
  demoTurn2,
} from "./demo-protocol.ts";
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

const { sessionOps, checkpoint } = await connectObpSession({
  url,
  signer,
  verifier,
  persistence,
  ledgerSeq,
  init: bootstrap.init,
  sessionEnvelopeSync: true,
  graphApplyOutbound: true,
  handlers: {
    async onProliferate(body) {
      const pay = demoCounterpartyPayload();
      if (body.offerId === demoTurn1.offerId) {
        return { portId: demoTurn1.portId, payload: pay };
      }
      if (body.offerId === demoTurn2.offerId) {
        return { portId: demoTurn2.portId, payload: pay };
      }
      throw new Error(`unexpected offer ${body.offerId}`);
    },
  },
});

const v = verifyExtends({ baseOps: [], deltaOps: sessionOps, claimed: checkpoint });
if (!v.ok) {
  throw new Error("checkpoint verify failed after session");
}

console.log("[demo] session complete");
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
