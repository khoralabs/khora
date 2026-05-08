/**
 * OBP HTTP/2 demo server. Ctrl+C to stop.
 * Auth: verifies Authorization: Bearer <invite token> signed by this server's Ed25519 key.
 *
 * Prerequisites: bun run bootstrap
 * Env: OBP_DEMO_SERVER_BOOTSTRAP, OBP_HOST (default 127.0.0.1), OBP_PORT (default 8765)
 */

import type { IncomingHttpHeaders } from "node:http2";
import { verifyInvite } from "@cfd/obp-auth";
import type { Party } from "@cfd/obp-core";
import { createEd25519FrameVerifier } from "@cfd/obp-core";
import { FakeObpPersistence } from "@cfd/obp-core/testing";
import { serveObp } from "@cfd/obp-server";
import { loadServerBootstrapFile, responderSignerFromBootstrap } from "./load-bootstrap.ts";

const host = process.env.OBP_HOST ?? "127.0.0.1";
const port = Number(process.env.OBP_PORT ?? "8765");

const bootstrap = await loadServerBootstrapFile();
const signer = await responderSignerFromBootstrap(bootstrap);
const verifier = createEd25519FrameVerifier();

let seq = 0;
const persistence = new FakeObpPersistence(() => ++seq);
let partiesHydrated = false;

function bearerToken(headers: IncomingHttpHeaders): string | undefined {
  const v = headers.authorization;
  const s = Array.isArray(v) ? v[0] : v;
  if (typeof s !== "string") return undefined;
  return /^Bearer\s+(\S+)$/i.exec(s.trim())?.[1];
}

const handle = await serveObp({
  verifier,
  persistence,
  ledgerSeq: () => ++seq,
  listen: { host, port },
  onConnect: async ({ headers }) => {
    const token = bearerToken(headers);
    if (token === undefined) throw new Error("unauthorized: missing bearer token");
    // verifyInvite checks the Ed25519 signature over the session init — no shared secret needed.
    const init = await verifyInvite(token, signer.actor);
    if (init === null) throw new Error("unauthorized: invalid invite token");
    if (!partiesHydrated) {
      const parties: Party[] = init.parties.map((p, i) => ({
        id: p.id,
        name: i === 0 ? "demo-server" : "demo-client",
        sourcemaps: [],
        created_seq: ++seq,
      }));
      persistence.importState({ parties, offers: [], ports: [], extendsRows: [], exposesRows: [], bindRows: [] });
      partiesHydrated = true;
    }
    return { init, signer };
  },
  async onIncomingOffer(body, session) {
    console.log("[server] offer:", body.offerId, body.bindPortId ?? "");
    if (body.bindPortId === "go") {
      await session.terminate("done");
      return null;
    }
    // Bind client's port and expose ours.
    return {
      offerId: "hello-back",
      offerType: "obp.demo",
      bindPortId: "to-server",
      counterparty_bind: {},
      ports: [{ id: "go", isTerminal: false }],
    };
  },
  async onTerminate(reason, _code, sessionId) {
    console.log("[server] chain terminated:", sessionId ?? "", reason);
  },
});

const url = `http://${host}:${handle.port}`;
console.log(`OBP demo server listening on ${url}`);
console.log(`Auth: verifyInvite (Ed25519, no shared secret). Server actor: ${signer.actor.slice(0, 16)}…`);
console.log("Run client: bun run client");

process.on("SIGINT", async () => { await handle.close(); process.exit(0); });
process.on("SIGTERM", async () => { await handle.close(); process.exit(0); });

await new Promise<void>(() => {});
