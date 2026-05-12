/**
 * OBP HTTP/2 server driven by @khoralabs/obp-agent-runtime structured bilateral contract + Gemini.
 *
 * Prerequisites: bun run bootstrap, GOOGLE_API_KEY
 * Env: same as scripts/server.ts plus OBP_NEGOTIATION_MODEL (optional)
 */

import {
  createNegotiationLedgerAndStructuredContract,
  dispatchNegotiatorIncomingOffer,
  type NegotiationTurnAudit,
  type ObpLedger,
  type TurnContract,
  wireStructuredTurnSummary,
} from "@khoralabs/obp-agent-runtime";
import { verifyInvite } from "@khoralabs/obp-auth";
import type { FrameSessionHandle, Party, TurnBody } from "@khoralabs/obp-core";
import {
  createEd25519FrameVerifier,
  OBPPersistenceClient,
  partyIdForSigner,
} from "@khoralabs/obp-core";
import { FakeObpPersistence } from "@khoralabs/obp-core/testing";
import { parseBearerToken, serveObp } from "@khoralabs/obp-server";
import { buildAgentDemoGraphSnapshot } from "./agent-graph-snapshot.ts";
import { getNegotiationModel, resolveDemoTurnBudgetMs } from "./agent-llm.ts";
import { loadServerBootstrapFile, responderSignerFromBootstrap } from "./load-bootstrap.ts";
import { setupResponderNegotiator } from "./network-negotiator-setup.ts";

const MAX_TURNS = 14;
const SCENARIO =
  process.env.OBP_AGENT_SCENARIO?.trim() ??
  "Two parties negotiate a minimal bilateral agreement over OBP frames. Prefer closing by binding a terminal port when terms are acceptable; otherwise use noop to continue or walk-away if negotiation should stop.";

const host = process.env.OBP_HOST ?? "127.0.0.1";
const port = Number(process.env.OBP_PORT ?? "8765");

const bootstrap = await loadServerBootstrapFile();
const signer = await responderSignerFromBootstrap(bootstrap);
const verifier = createEd25519FrameVerifier();
const { registry: negotiatorRegistry, identity: negotiatorIdentity } =
  await setupResponderNegotiator();

const clock = { seq: 0 };
const ledgerSeq = () => ++clock.seq;
const persistence = new FakeObpPersistence(ledgerSeq);
const obpClient = new OBPPersistenceClient({ persistence, ledgerSeq });
let partiesHydrated = false;

type ChainState = {
  ledger: ObpLedger<NegotiationTurnAudit>;
  contract: TurnContract<NegotiationTurnAudit>;
  serverPartyId: string;
  wireSend: { current: null | ((body: TurnBody) => Promise<void>) };
};

const chainsBySessionId = new Map<string, ChainState>();

function ensureChain(session: FrameSessionHandle): ChainState {
  const sid = session.sessionId;
  const existing = chainsBySessionId.get(sid);
  if (existing !== undefined) return existing;

  const serverPartyId = partyIdForSigner(session.init, signer.actor);

  const wireSend = { current: null as null | ((body: TurnBody) => Promise<void>) };

  const { ledger, contract } = createNegotiationLedgerAndStructuredContract(
    {
      client: obpClient,
      persistence,
      ledgerSeq,
      maxTurns: MAX_TURNS,
    },
    (ledger) => ({
      partyRoleName: (pid) => (pid === serverPartyId ? "Server (responder)" : "Client (initiator)"),
      scenario: SCENARIO,
      getGraphSnapshot: () =>
        buildAgentDemoGraphSnapshot(persistence, obpClient, clock.seq, ledger.completedTurns),
      requireNoop: true,
      requireWalkAway: true,
      allowAgentPortTtl: false,
      defaultPortTtl: { basis: "turns", measure: 12 },
      commitStructuredTurn: async (_, body) => {
        const send = wireSend.current;
        if (send === null) {
          throw new Error("[agent-server] wire send not wired before structured commit");
        }
        await send(body);
        return wireStructuredTurnSummary(body);
      },
    }),
  );

  const state: ChainState = { ledger, contract, serverPartyId, wireSend };
  chainsBySessionId.set(sid, state);
  return state;
}

const handle = await serveObp({
  verifier,
  persistence,
  ledgerSeq,
  listen: { host, port },
  onConnect: async ({ headers }) => {
    const token = parseBearerToken(headers);
    if (token === undefined) throw new Error("unauthorized: missing bearer token");
    const init = await verifyInvite(token, signer.actor);
    if (init === null) throw new Error("unauthorized: invalid invite token");
    if (!partiesHydrated) {
      const parties: Party[] = init.parties.map((p, i) => ({
        id: p.id,
        name: i === 0 ? "demo-server" : "demo-client",
        sourcemaps: [],
        created_seq: ledgerSeq(),
      }));
      persistence.importState({
        parties,
        offers: [],
        ports: [],
        extendsRows: [],
        exposesRows: [],
        bindRows: [],
      });
      partiesHydrated = true;
    }
    return { init, signer };
  },
  async onIncomingOffer(_body: TurnBody, session) {
    const state = ensureChain(session);
    state.wireSend.current = session.sendTurn.bind(session);
    await dispatchNegotiatorIncomingOffer({
      ledger: state.ledger,
      contract: state.contract,
      partyId: state.serverPartyId,
      registry: negotiatorRegistry,
      identity: negotiatorIdentity,
      model: getNegotiationModel(),
      budgetMs: resolveDemoTurnBudgetMs(),
      session,
      logPrefix: "[agent-server]",
    });
    return null;
  },
  async onTerminate(_reason, _code, sessionId) {
    if (sessionId !== undefined) {
      chainsBySessionId.delete(sessionId);
    }
  },
});

const url = `http://${host}:${handle.port}`;
console.log(`OBP agent server listening on ${url}`);
console.log("Requires GOOGLE_API_KEY; run agent-client in another terminal.");

process.on("SIGINT", async () => {
  await handle.close();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await handle.close();
  process.exit(0);
});

await new Promise<void>(() => {});
