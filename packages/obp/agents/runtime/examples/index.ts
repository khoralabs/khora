import { ObpClient, type Party } from "@cfd/obp-core";
import { FakeObpPersistence } from "@cfd/obp-core/testing";
import type {
  ObpNegotiatorPreparedTurn,
  ObpNegotiatorStructuredSessionContext,
  ObpNegotiatorStructuredSessionInput,
  ObpNegotiatorStructuredSessionOutput,
} from "@cfd/obp-negotiator";
import {
  BilateralCoordinator,
  createNegotiationStructuredBilateralContract,
  formatNegotiationProviderError,
  type NegotiationTurnAudit,
  ObpLedger,
  type PreparedTurn,
} from "../src/index.ts";
import { buildGraphSnapshot } from "./graph-snapshot.ts";
import indexHtml from "./index.html";
import { getNegotiationModel, isLlmConfigured } from "./llm-env.ts";
import {
  createNegotiationPartyIdentities,
  type NegotiationPartyIdentities,
} from "./negotiation-agents.ts";
import { NEGOTIATION_LLM_TURN_BUDGET_MS } from "./negotiation-timeouts.ts";
import type { BindOption } from "./negotiation-types.ts";
import { scenarioForUserMessage } from "./scenario.ts";

const MAX_TURNS = 12;

const firstActor: "buyer" | "seller" =
  process.env.NEGOTIATION_FIRST?.trim().toLowerCase() === "buyer" ? "buyer" : "seller";

const INITIAL_CLOCK_T = 1_700_000_000_000;
const clock = { t: INITIAL_CLOCK_T };
const now = () => clock.t;

let persistence: FakeObpPersistence;
let client: ObpClient;
let buyer: Party;
let seller: Party;
let walkAwayRequested = false;
let ledger: ObpLedger<NegotiationTurnAudit>;
let coordinator: BilateralCoordinator<NegotiationTurnAudit>;
let identitiesPromise: Promise<NegotiationPartyIdentities> | null = null;

function getIdentityBundle(): Promise<NegotiationPartyIdentities> {
  identitiesPromise ??= createNegotiationPartyIdentities();
  return identitiesPromise;
}

function partyRoleLabel(partyId: string): "buyer" | "seller" {
  return partyId === buyer.id ? "buyer" : "seller";
}

function partyRoleName(partyId: string): string {
  return partyId === buyer.id ? "Buyer" : "Seller";
}

function priorAuditsSummary(): string {
  if (ledger.audits.length === 0) {
    return "";
  }
  return ledger.audits
    .map((a) => {
      if (a.kind === "genesis") {
        return `- turn ${a.turnIndex} genesis: newOfferType=${a.newOfferType}; exposed=${a.exposedPorts.map((p) => p.portType).join(", ") || "(none)"}`;
      }
      return `- turn ${a.turnIndex} bind: bindKind=${a.bindKind}; chose=${a.chosenPortType}; counterpartyState=${a.counterpartyHeadOfferType ?? "?"}; newOfferType=${a.newOfferType}; exposed=${a.exposedPorts.map((p) => p.portType).join(", ") || "(none)"}`;
    })
    .join("\n");
}

async function initNegotiationSession(): Promise<void> {
  persistence = new FakeObpPersistence(now);
  client = new ObpClient(persistence, { now });
  buyer = persistence.registerParty({ name: "Buyer", sourcemaps: [] }).party;
  seller = persistence.registerParty({ name: "Seller", sourcemaps: [] }).party;
  walkAwayRequested = false;
  clock.t = INITIAL_CLOCK_T;

  ledger = new ObpLedger<NegotiationTurnAudit>({
    client,
    persistence,
    now,
    maxTurns: MAX_TURNS,
  });

  const contract = createNegotiationStructuredBilateralContract({
    ledger,
    partyRoleName,
    scenario: scenarioForUserMessage(),
    getGraphSnapshot: () => buildGraphSnapshot(persistence, client, clock.t, ledger.completedTurns),
    getPriorAuditsSummary: priorAuditsSummary,
    requireNoop: true,
    requireWalkAway: true,
    allowAgentPortTtl: false,
    defaultPortTtl: { basis: "turns", measure: 1 },
    requestNegotiationEnd: () => {
      walkAwayRequested = true;
    },
  });

  const ids = await getIdentityBundle();
  const firstPartyId = firstActor === "buyer" ? buyer.id : seller.id;

  coordinator = new BilateralCoordinator<NegotiationTurnAudit>({
    ledger,
    parties: [buyer.id, seller.id],
    contract,
    firstPartyId,
    runAgentTurn: async ({ partyId, prepared }) => {
      const identity = partyId === buyer.id ? ids.buyer : ids.seller;
      const ctx: Omit<ObpNegotiatorStructuredSessionContext, "agent"> = {
        model: getNegotiationModel(),
        prepared: preparedToNegotiatorTurn(prepared),
        budgetMs: NEGOTIATION_LLM_TURN_BUDGET_MS,
      };
      const session = ids.registry.createSession(identity.agentId, { ctx });
      const out = await session.start<
        ObpNegotiatorStructuredSessionInput,
        ObpNegotiatorStructuredSessionOutput
      >({});
      return out.output;
    },
  });
}

function preparedToNegotiatorTurn(p: PreparedTurn<unknown>): ObpNegotiatorPreparedTurn {
  return {
    ...(p.zodOutputSchema !== undefined ? { zodOutputSchema: p.zodOutputSchema } : {}),
    ...(p.outputSchema !== undefined ? { outputSchema: p.outputSchema } : {}),
    systemFragments: p.systemFragments,
    userMessage: p.userMessage,
    ...(p.metadata !== undefined
      ? { metadata: p.metadata as ObpNegotiatorPreparedTurn["metadata"] }
      : {}),
  };
}

await initNegotiationSession();

function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function agreementReachedFromAudits(list: ReadonlyArray<NegotiationTurnAudit>): boolean {
  const last = list[list.length - 1];
  if (last === undefined || last.kind !== "bind") {
    return false;
  }
  if (last.bindKind !== "real") {
    return false;
  }
  const chosen = last.bindMenu.find((b) => b.portId === last.chosenPortId);
  return chosen?.terminal === true;
}

async function buildStateResponse(): Promise<object> {
  const turnsCompleted = ledger.completedTurns;
  const snapshot = buildGraphSnapshot(persistence, client, clock.t, turnsCompleted);
  const agreementReached = agreementReachedFromAudits(ledger.audits);
  const negotiationEnded = walkAwayRequested || ledger.isExhausted() || agreementReached;
  const llm = isLlmConfigured();

  const nextActorHint =
    negotiationEnded || !llm ? null : partyRoleLabel(coordinator.expectedActingPartyId());

  let nextTurn: {
    mode: "genesis" | "bind";
    actingPartyId: string;
    actingRole: "buyer" | "seller";
    counterpartyHeadOfferType: string | null;
    bindOptions: BindOption[];
  } | null = null;

  if (!negotiationEnded && llm && !ledger.isExhausted() && !walkAwayRequested) {
    const nextId = coordinator.expectedActingPartyId();
    const actingRole = partyRoleLabel(nextId);
    const probe = await coordinator.contract.hasNoBindableCounterpartyPorts?.(nextId);
    if (probe === true) {
      nextTurn = {
        mode: "genesis",
        actingPartyId: nextId,
        actingRole,
        counterpartyHeadOfferType: null,
        bindOptions: [],
      };
    } else {
      // Reuse the contract's prepare to produce a stable bind menu for the UI.
      // (The coordinator will re-prepare on the actual turn; identical state.)
      try {
        const prepared = await coordinator.contract.prepare(nextId);
        const bindOptions = (prepared.metadata?.bindMenu as BindOption[] | undefined) ?? [];
        nextTurn = {
          mode: "bind",
          actingPartyId: nextId,
          actingRole,
          counterpartyHeadOfferType:
            (prepared.metadata?.counterpartyHeadOfferType as string | null | undefined) ?? null,
          bindOptions,
        };
      } catch {
        nextTurn = null;
      }
    }
  }

  return {
    graph: snapshot,
    audits: ledger.audits,
    turnsCompleted,
    maxTurns: MAX_TURNS,
    negotiationEnded,
    nextActorHint,
    nextTurn,
    negotiationFirst: firstActor,
    partyIds: { buyer: buyer.id, seller: seller.id },
    walkAwayRequested,
    llmConfigured: llm,
    agreementReached,
  };
}

let turnMutex = Promise.resolve();

async function handleNegotiationReset(): Promise<Response> {
  await initNegotiationSession();
  return jsonResponse({ ok: true, state: await buildStateResponse() });
}

function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = turnMutex.then(fn);
  turnMutex = run.then(
    () => {},
    () => {},
  );
  return run;
}

async function handleNegotiationTurn(actingPartyId: string): Promise<Response> {
  if (!isLlmConfigured()) {
    return jsonResponse({ ok: false, error: "llm_not_configured" }, 503);
  }
  if (actingPartyId !== buyer.id && actingPartyId !== seller.id) {
    return jsonResponse({ ok: false, error: "unknown_party" }, 400);
  }
  if (ledger.isExhausted()) {
    return jsonResponse({ ok: false, error: "max_turns" }, 400);
  }
  if (walkAwayRequested) {
    return jsonResponse({ ok: false, error: "negotiation_ended" }, 400);
  }
  if (agreementReachedFromAudits(ledger.audits)) {
    return jsonResponse({ ok: false, error: "negotiation_ended" }, 400);
  }

  const expected = coordinator.expectedActingPartyId();
  if (actingPartyId !== expected) {
    return jsonResponse(
      { ok: false, error: "wrong_turn_party", expectedParty: partyRoleLabel(expected) },
      400,
    );
  }

  try {
    const result = await coordinator.runNextTurn();
    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error }, 422);
    }
    clock.t += 1;
    return jsonResponse({ ok: true, state: await buildStateResponse() });
  } catch (e) {
    return jsonResponse({ ok: false, error: formatNegotiationProviderError(e) }, 500);
  }
}

const server = Bun.serve({
  port: Number(process.env.PORT) || 3456,
  routes: {
    "/": indexHtml,
  },
  async fetch(req): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/api/health" && req.method === "GET") {
      return jsonResponse({ llmReady: isLlmConfigured() });
    }

    if (url.pathname === "/api/state" && req.method === "GET") {
      return jsonResponse(await buildStateResponse());
    }

    if (url.pathname === "/api/negotiation/turn" && req.method === "POST") {
      let body: { actingPartyId?: string };
      try {
        body = (await req.json()) as { actingPartyId?: string };
      } catch {
        return jsonResponse({ ok: false, error: "invalid_json" }, 400);
      }
      const actingPartyId = body.actingPartyId?.trim();
      if (!actingPartyId) {
        return jsonResponse({ ok: false, error: "missing_acting_party_id" }, 400);
      }
      return runExclusive(() => handleNegotiationTurn(actingPartyId));
    }

    if (url.pathname === "/api/negotiation/reset" && req.method === "POST") {
      return runExclusive(() => handleNegotiationReset());
    }

    return new Response("Not found", { status: 404 });
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(
  `OBP negotiation demo (LLM): http://localhost:${server.port} (NEGOTIATION_FIRST=${firstActor})`,
);
