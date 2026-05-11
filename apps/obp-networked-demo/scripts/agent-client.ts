/**
 * OBP HTTP/2 client driven by structured bilateral negotiation agent + Gemini.
 * Opens negotiation with a genesis turn; reacts on inbound offers via the same contract.
 *
 * Prerequisites: bun run bootstrap, GOOGLE_API_KEY, agent-server running
 * Env: OBP_URL, OBP_DEMO_CLIENT_BOOTSTRAP, OBP_NEGOTIATION_MODEL (optional)
 */

import {
  createNegotiationLedgerAndStructuredContract,
  dispatchNegotiatorIncomingOffer,
  negotiationShouldEnd,
  runStructuredNegotiatorTurn,
  wireStructuredTurnSummary,
} from "@cfd/obp-agent-runtime";
import { connectObpSession } from "@cfd/obp-client";
import {
  createEd25519FrameVerifier,
  OBPPersistenceClient,
  partyIdForSigner,
  type TurnBody,
} from "@cfd/obp-core";
import { FakeObpPersistence } from "@cfd/obp-core/testing";
import { buildAgentDemoGraphSnapshot } from "./agent-graph-snapshot.ts";
import { getNegotiationModel, resolveDemoTurnBudgetMs } from "./agent-llm.ts";
import { initiatorSignerFromBootstrap, loadClientBootstrapFile } from "./load-bootstrap.ts";
import { setupInitiatorNegotiator } from "./network-negotiator-setup.ts";

const MAX_TURNS = 14;
const SCENARIO =
  process.env.OBP_AGENT_SCENARIO?.trim() ??
  "Two parties negotiate a minimal bilateral agreement over OBP frames. Open with a concise offer and expose at least one port the server can bind. Prefer terminal closure when satisfied.";

const bootstrap = await loadClientBootstrapFile();
const signer = await initiatorSignerFromBootstrap(bootstrap);
const verifier = createEd25519FrameVerifier();
const { registry: negotiatorRegistry, identity: negotiatorIdentity } =
  await setupInitiatorNegotiator();

const clock = { seq: 0 };
const ledgerSeq = () => ++clock.seq;
const persistence = new FakeObpPersistence(ledgerSeq);
const obpClient = new OBPPersistenceClient({ persistence, ledgerSeq });

persistence.importState({
  parties: bootstrap.parties,
  offers: [],
  ports: [],
  extendsRows: [],
  exposesRows: [],
  bindRows: [],
});

const clientPartyId = partyIdForSigner(bootstrap.init, signer.actor);

const wireSend = { current: null as null | ((body: TurnBody) => Promise<void>) };

const { ledger, contract } = createNegotiationLedgerAndStructuredContract(
  {
    client: obpClient,
    persistence,
    ledgerSeq,
    maxTurns: MAX_TURNS,
  },
  (ledger) => ({
    partyRoleName: (pid) => (pid === clientPartyId ? "Client (initiator)" : "Server (responder)"),
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
        throw new Error("[agent-client] wire send not wired before structured commit");
      }
      await send(body);
      return wireStructuredTurnSummary(body);
    },
  }),
);

const url = process.env.OBP_URL ?? "http://127.0.0.1:8765";

const { sessionOps } = await connectObpSession(
  {
    url,
    requestHeaders: { authorization: `Bearer ${bootstrap.inviteToken}` },
    signer,
    verifier,
    persistence,
    ledgerSeq,
  },
  async (conn) => {
    let resolveDone!: () => void;
    const done = new Promise<void>((r) => {
      resolveDone = r;
    });

    const chain = await conn.init(bootstrap.init, {
      async onIncomingOffer(_body, sess) {
        wireSend.current = sess.sendTurn.bind(sess);
        await dispatchNegotiatorIncomingOffer({
          ledger,
          contract,
          partyId: clientPartyId,
          registry: negotiatorRegistry,
          identity: negotiatorIdentity,
          model: getNegotiationModel(),
          budgetMs: resolveDemoTurnBudgetMs(),
          session: sess,
          logPrefix: "[agent-client]",
          onMaxTurns: resolveDone,
          onAgentTurnFailed: resolveDone,
        });
        return null;
      },
      async onTerminate() {
        resolveDone();
      },
    });

    wireSend.current = chain.sendTurn.bind(chain);

    try {
      const { audit } = await runStructuredNegotiatorTurn({
        registry: negotiatorRegistry,
        identity: negotiatorIdentity,
        contract,
        partyId: clientPartyId,
        model: getNegotiationModel(),
        budgetMs: resolveDemoTurnBudgetMs(),
      });
      console.log("[agent-client] genesis audit:", audit.kind);
      if (negotiationShouldEnd(audit) || ledger.isExhausted()) {
        await chain.terminate("done");
        resolveDone();
      }
    } catch (e: unknown) {
      console.error("[agent-client] genesis failed:", e);
      await chain.terminate("agent_error");
      resolveDone();
    }

    await done;
  },
);

console.log(`[agent-client] done. session ops: ${sessionOps.length}`);
