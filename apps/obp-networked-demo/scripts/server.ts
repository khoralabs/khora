/**
 * Long-lived OBP HTTP/2 (h2c) server. Ctrl+C to stop.
 *
 * Prerequisites: `bun run bootstrap`
 * Env: OBP_DEMO_BOOTSTRAP, OBP_HOST (default 127.0.0.1), OBP_PORT (default 8765)
 */
import type { FrameSessionHandle, TurnBody } from "@cfd/obp-core";
import { createEd25519FrameVerifier } from "@cfd/obp-core";
import { FakeObpPersistence } from "@cfd/obp-core/testing";
import { serveObp } from "@cfd/obp-server";
import { type DemoRoundConfig, demoBindPolicy, demoRound1, demoRound2 } from "./demo-protocol.ts";
import { loadBootstrapFile, responderSignerFromBootstrap } from "./load-bootstrap.ts";

const host = process.env.OBP_HOST ?? "127.0.0.1";
const port = Number(process.env.OBP_PORT ?? "8765");

const bootstrap = await loadBootstrapFile();
const signer = await responderSignerFromBootstrap(bootstrap);
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

const portSpec = (id: string) => ({
  id,
  isTerminal: false,
  max_bindings: 8,
  bind_policy: demoBindPolicy,
});

async function handleDemoRound(
  body: TurnBody,
  session: FrameSessionHandle,
  round: DemoRoundConfig,
): Promise<TurnBody | null> {
  console.log("[demo] inbound turn", session.sessionId, body.offerId, body.bindPortId ?? "");
  if (body.bindPortId === round.turn2.portId) {
    await session.terminate("ok");
    return null;
  }
  if (body.bindPortId === round.turn1.portId) {
    console.log("[demo] exposing second offer", round.turn2.offerId);
    return {
      offerId: round.turn2.offerId,
      offerType: "obp.demo",
      ports: [portSpec(round.turn2.portId)],
    };
  }
  if (body.offerId === round.clientOffer) {
    return {
      offerId: round.turn1.offerId,
      offerType: "obp.demo",
      bindPortId: round.clientPort,
      counterparty_bind: {},
      ports: [portSpec(round.turn1.portId)],
    };
  }
  await session.terminate(`unexpected turn ${body.offerId}`);
  return null;
}

const handle = await serveObp({
  signer,
  verifier,
  persistence,
  ledgerSeq,
  init: bootstrap.init,
  multiplex: true,
  listen: { host, port },
  sessionEnvelopeSync: true,
  graphApplyOutbound: true,
  async onIncomingOffer(body, session) {
    const round = session.sessionId.endsWith("-r2") ? demoRound2 : demoRound1;
    return handleDemoRound(body, session, round);
  },
  async onTerminate(reason, _code, sessionId) {
    console.log("[demo] chain terminated:", sessionId ?? "", reason);
  },
});

const url = `http://${host}:${handle.port}`;
console.log(`OBP demo server listening on ${url} (POST /obp/v1)`);
console.log("Multiplex: two negotiation chains per TCP connection (see client).");
console.log("Run in another terminal: bun run client");
console.log(`Or: OBP_URL=${url} bun run client`);

const shutdown = async () => {
  console.log("\n[demo] shutting down…");
  await handle.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await new Promise<void>(() => {});
