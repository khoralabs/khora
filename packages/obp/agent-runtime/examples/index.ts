import type {
  RegisteredAgentIdentity,
  ToolkitContext,
  ToolRuntimeContext,
} from "@cfd/agent-identity";
import { ObpClient, type Party } from "@cfd/obp-core";
import { FakeObpPersistence } from "@cfd/obp-core/testing";
import { NegotiationRuntime, type NegotiationTurnAudit } from "../src/runtime.ts";
import { buildGraphSnapshot } from "./graph-snapshot.ts";
import indexHtml from "./index.html";
import { getNegotiationModel, isLlmConfigured } from "./llm-env.ts";
import {
  createNegotiationPartyIdentities,
  type NegotiationPartyIdentities,
} from "./negotiation-agents.ts";
import { runLlmTurn } from "./run-llm-turn.ts";

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
const audits: NegotiationTurnAudit[] = [];
let runtime: NegotiationRuntime;

function initNegotiationSession(): void {
  persistence = new FakeObpPersistence(now);
  client = new ObpClient(persistence, { now });
  buyer = persistence.registerParty({ name: "Buyer", sourcemaps: [] }).party;
  seller = persistence.registerParty({ name: "Seller", sourcemaps: [] }).party;
  walkAwayRequested = false;
  audits.length = 0;
  clock.t = INITIAL_CLOCK_T;
  runtime = new NegotiationRuntime({
    client,
    persistence,
    now,
    maxTurns: MAX_TURNS,
    requireNoop: true,
    requireWalkAway: true,
    allowAgentPortTtl: false,
    defaultPortTtl: { basis: "turns", measure: 1 },
    requestNegotiationEnd: () => {
      walkAwayRequested = true;
    },
  });
}

initNegotiationSession();

function firstPartyId(): string {
  return firstActor === "buyer" ? buyer.id : seller.id;
}

function secondPartyId(): string {
  return firstActor === "buyer" ? seller.id : buyer.id;
}

/** Party id that may act when `turnsCompleted` turns are already done. */
function expectedActingPartyId(turnsCompleted: number): string {
  return turnsCompleted % 2 === 0 ? firstPartyId() : secondPartyId();
}

function partyRoleLabel(partyId: string): "buyer" | "seller" {
  return partyId === buyer.id ? "buyer" : "seller";
}

let identitiesPromise: Promise<NegotiationPartyIdentities> | null = null;
function getIdentityBundle(): Promise<NegotiationPartyIdentities> {
  identitiesPromise ??= createNegotiationPartyIdentities();
  return identitiesPromise;
}

function toolkitAndRuntime(agentIdentity: RegisteredAgentIdentity): {
  toolkitCtx: ToolkitContext<Record<string, never>>;
  toolRuntime: ToolRuntimeContext<Record<string, never>>;
} {
  const toolkitCtx: ToolkitContext<Record<string, never>> = {
    env: {},
    agentId: agentIdentity.agentId,
    agentName: agentIdentity.name,
  };
  const toolRuntime: ToolRuntimeContext<Record<string, never>> = {
    env: {},
    agentId: agentIdentity.agentId,
    agentName: agentIdentity.name,
  };
  return { toolkitCtx, toolRuntime };
}

function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function agreementReachedFromAudits(list: NegotiationTurnAudit[]): boolean {
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

function priorAuditsSummary(): string {
  if (audits.length === 0) {
    return "";
  }
  return audits
    .map((a) => {
      if (a.kind === "genesis") {
        return `- turn ${a.turnIndex} genesis: newOfferType=${a.newOfferType}; exposed=${a.exposedPorts.map((p) => p.portType).join(", ") || "(none)"}`;
      }
      return `- turn ${a.turnIndex} bind: bindKind=${a.bindKind}; chose=${a.chosenPortType}; counterpartyState=${a.counterpartyHeadOfferType ?? "?"}; newOfferType=${a.newOfferType}; exposed=${a.exposedPorts.map((p) => p.portType).join(", ") || "(none)"}`;
    })
    .join("\n");
}

async function buildStateResponse(): Promise<object> {
  const turnsCompleted = runtime.turns;
  const snapshot = buildGraphSnapshot(persistence, client, clock.t, turnsCompleted);
  const agreementReached = agreementReachedFromAudits(audits);
  const negotiationEnded = walkAwayRequested || turnsCompleted >= MAX_TURNS || agreementReached;
  const llm = isLlmConfigured();

  const nextActorHint =
    negotiationEnded || !llm ? null : partyRoleLabel(expectedActingPartyId(turnsCompleted));

  let nextTurn: {
    mode: "genesis" | "bind";
    actingPartyId: string;
    actingRole: "buyer" | "seller";
    counterpartyHeadOfferType: string | null;
    bindOptions: Array<{ portId: string; portType: string; terminal: boolean }>;
  } | null = null;

  if (!negotiationEnded && llm && turnsCompleted < MAX_TURNS && !walkAwayRequested) {
    const nextId = expectedActingPartyId(turnsCompleted);
    const actingRole = partyRoleLabel(nextId);
    if (
      turnsCompleted === 0 &&
      nextId === firstPartyId() &&
      (await runtime.hasNoBindableCounterpartyPorts(nextId))
    ) {
      nextTurn = {
        mode: "genesis",
        actingPartyId: nextId,
        actingRole,
        counterpartyHeadOfferType: null,
        bindOptions: [],
      };
    } else {
      const snap = await runtime.getBindSnapshotForParty(nextId);
      if (snap !== null) {
        nextTurn = {
          mode: "bind",
          actingPartyId: nextId,
          actingRole,
          counterpartyHeadOfferType: snap.counterpartyHeadOfferType,
          bindOptions: snap.bindMenu,
        };
      }
    }
  }

  return {
    graph: snapshot,
    audits,
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
  initNegotiationSession();
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
  if (runtime.turns >= MAX_TURNS) {
    return jsonResponse({ ok: false, error: "max_turns" }, 400);
  }
  if (walkAwayRequested) {
    return jsonResponse({ ok: false, error: "negotiation_ended" }, 400);
  }
  if (agreementReachedFromAudits(audits)) {
    return jsonResponse({ ok: false, error: "negotiation_ended" }, 400);
  }

  const expected = expectedActingPartyId(runtime.turns);
  if (actingPartyId !== expected) {
    return jsonResponse(
      {
        ok: false,
        error: "wrong_turn_party",
        expectedParty: partyRoleLabel(expected),
      },
      400,
    );
  }

  const genesisTurn =
    runtime.turns === 0 &&
    actingPartyId === firstPartyId() &&
    (await runtime.hasNoBindableCounterpartyPorts(actingPartyId));

  const ids = await getIdentityBundle();
  const identity = actingPartyId === buyer.id ? ids.buyer : ids.seller;
  const { toolkitCtx, toolRuntime } = toolkitAndRuntime(identity);
  const partyRoleName = actingPartyId === buyer.id ? "Buyer" : "Seller";

  const graph = buildGraphSnapshot(persistence, client, clock.t, runtime.turns);
  const model = getNegotiationModel();

  try {
    const result = await runLlmTurn({
      model,
      identity,
      toolkitCtx,
      toolRuntime,
      negotiation: runtime,
      actingPartyId,
      partyRoleName,
      graph,
      priorAuditsSummary: priorAuditsSummary(),
      genesisTurn,
    });

    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error }, 422);
    }

    audits.push(result.audit);
    clock.t += 1;

    return jsonResponse({ ok: true, state: await buildStateResponse() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ ok: false, error: msg }, 500);
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
