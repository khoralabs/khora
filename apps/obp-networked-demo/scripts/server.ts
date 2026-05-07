/**
 * Long-lived OBP HTTP/2 (h2c) server. Ctrl+C to stop.
 *
 * Prerequisites: `bun run bootstrap`
 * Env: OBP_DEMO_BOOTSTRAP, OBP_HOST (default 127.0.0.1), OBP_PORT (default 8765)
 */
import { createEd25519FrameVerifier } from "@cfd/obp-core";
import { FakeObpPersistence } from "@cfd/obp-core/testing";
import { serveObp } from "@cfd/obp-server";
import { demoBindPolicy, demoTurn1, demoTurn2 } from "./demo-protocol.ts";
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

const handle = await serveObp({
  signer,
  verifier,
  persistence,
  ledgerSeq,
  init: bootstrap.init,
  listen: { host, port },
  sessionEnvelopeSync: true,
  graphApplyOutbound: true,
  async onConnect(session) {
    console.log("[demo] session connected");
    await session.expose({
      offerId: demoTurn1.offerId,
      ports: [
        {
          id: demoTurn1.portId,
          isTerminal: false,
          max_bindings: 8,
          bind_policy: demoBindPolicy,
        },
      ],
    });
  },
  async onBind(portId, _payload, session) {
    console.log("[demo] client bound:", portId);
    if (portId === demoTurn1.portId) {
      console.log("[demo] exposing turn 2");
      await session.expose({
        offerId: demoTurn2.offerId,
        ports: [
          {
            id: demoTurn2.portId,
            isTerminal: false,
            max_bindings: 8,
            bind_policy: demoBindPolicy,
          },
        ],
      });
      return;
    }
    if (portId === demoTurn2.portId) {
      await session.terminate("ok");
      return;
    }
    await session.terminate(`unexpected port ${portId}`);
  },
  async onTerminate(reason) {
    console.log("[demo] terminated:", reason);
  },
});

const url = `http://${host}:${handle.port}`;
console.log(`OBP demo server listening on ${url} (POST /obp/v1)`);
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
