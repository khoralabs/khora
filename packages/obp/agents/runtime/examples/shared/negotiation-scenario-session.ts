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
} from "../../src/index.ts";
import { buildGraphSnapshot } from "./graph-snapshot.ts";
import { getNegotiationModel, isLlmConfigured } from "./llm-env.ts";
import {
  createNegotiationPartyIdentities,
  type NegotiationPartyIdentities,
} from "./negotiation-agents.ts";
import { NEGOTIATION_LLM_TURN_BUDGET_MS } from "./negotiation-timeouts.ts";
import type { BindOption, PartyDisplayNames } from "./negotiation-types.ts";

const MAX_TURNS = 12;

const firstActor: "buyer" | "seller" =
  process.env.NEGOTIATION_FIRST?.trim().toLowerCase() === "buyer" ? "buyer" : "seller";

const INITIAL_LEDGER_SEQ = 1_700_000_000_000;

export type ScenarioNegotiationCopy = {
  scenarioForUserMessage: () => string;
  scenarioBlockForIdentity: (isBuyer: boolean) => string;
  partyDisplayNames: PartyDisplayNames;
};

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

export function createNegotiationScenarioSession(scenario: ScenarioNegotiationCopy) {
  const clock = { t: INITIAL_LEDGER_SEQ };
  const ledgerSeq = () => clock.t;

  const partyNames = scenario.partyDisplayNames;

  let persistence: FakeObpPersistence;
  let client: ObpClient;
  let buyer: Party;
  let seller: Party;
  let walkAwayRequested = false;
  let ledger: ObpLedger<NegotiationTurnAudit>;
  let coordinator: BilateralCoordinator<NegotiationTurnAudit>;
  let identitiesPromise: Promise<NegotiationPartyIdentities> | null = null;
  let turnMutex = Promise.resolve();

  function getIdentityBundle(): Promise<NegotiationPartyIdentities> {
    identitiesPromise ??= createNegotiationPartyIdentities({
      scenarioBlockForIdentity: scenario.scenarioBlockForIdentity,
      partyDisplayNames: partyNames,
    });
    return identitiesPromise;
  }

  function partyRoleLabel(partyId: string): "buyer" | "seller" {
    return partyId === buyer.id ? "buyer" : "seller";
  }

  function partyRoleName(partyId: string): string {
    return partyId === buyer.id ? partyNames.buyer : partyNames.seller;
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
    persistence = new FakeObpPersistence(ledgerSeq);
    client = new ObpClient(persistence, { ledgerSeq });
    buyer = persistence.registerParty({ name: partyNames.buyer, sourcemaps: [] }).party;
    seller = persistence.registerParty({ name: partyNames.seller, sourcemaps: [] }).party;
    walkAwayRequested = false;
    clock.t = INITIAL_LEDGER_SEQ;

    ledger = new ObpLedger<NegotiationTurnAudit>({
      client,
      persistence,
      ledgerSeq,
      maxTurns: MAX_TURNS,
    });

    const contract = createNegotiationStructuredBilateralContract({
      ledger,
      partyRoleName,
      scenario: scenario.scenarioForUserMessage(),
      getGraphSnapshot: () =>
        buildGraphSnapshot(persistence, client, clock.t, ledger.completedTurns),
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
      partyDisplayNames: { buyer: partyNames.buyer, seller: partyNames.seller },
      walkAwayRequested,
      llmConfigured: llm,
      agreementReached,
    };
  }

  let initialized = false;

  async function ensureInitialized(): Promise<void> {
    if (!initialized) {
      await initNegotiationSession();
      initialized = true;
    }
  }

  async function handleNegotiationReset(): Promise<Response> {
    await initNegotiationSession();
    initialized = true;
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
    await ensureInitialized();
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
        { ok: false, error: "wrong_turn_party", expectedParty: partyRoleName(expected) },
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

  return {
    handleHealth: (): Response => jsonResponse({ llmReady: isLlmConfigured() }),

    handleState: async (): Promise<Response> => {
      await ensureInitialized();
      return jsonResponse(await buildStateResponse());
    },

    handleTurn: async (req: Request): Promise<Response> => {
      await ensureInitialized();
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
    },

    handleReset: async (): Promise<Response> => {
      return runExclusive(() => handleNegotiationReset());
    },
  };
}

export type NegotiationScenarioSession = ReturnType<typeof createNegotiationScenarioSession>;
