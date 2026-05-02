import type { ObpToolkitEnv } from "@cfd/obp-tools";
import { noopPortIdForHeadOffer } from "../constants.ts";
import type { ObpLedger } from "../ledger.ts";
import { buildObpNegotiationUserMessage, type GraphSnapshotForPrompt } from "../prompt.ts";
import {
  type NegotiationBindMenuEntry,
  type NegotiationBindTurnAudit,
  NegotiationRuntime,
  type NegotiationRuntimeOptions,
  type NegotiationTurnAudit,
} from "../runtime.ts";
import type { TtlSpec } from "../ttl-spec.ts";
import type { PreparedTurn, TurnContract } from "../turn-contract.ts";

/** Always-allowed write tools regardless of bind menu state. */
const STATIC_ALLOWED_TOOLS: readonly string[] = [
  "obp_extend_offer",
  "obp_expose_port",
  "obp_end_negotiation",
];

function bindToolName(portId: string): string {
  return `obp_bind__${portId}`;
}

export type ToolLoopBilateralContractOptions = {
  ledger: ObpLedger<NegotiationTurnAudit>;
  partyRoleName: (partyId: string) => string;
  scenario?: string;
  getGraphSnapshot: () => GraphSnapshotForPrompt;
  getPriorAuditsSummary?: () => string;
  /**
   * Tools always allowed in addition to whatever this contract derives from the
   * bind menu. Defaults to {@link STATIC_ALLOWED_TOOLS} (extend / expose /
   * end-negotiation). Override to widen or narrow the toolbelt.
   */
  extraAllowedToolNames?: readonly string[];
  requireNoop?: NegotiationRuntimeOptions["requireNoop"];
  requireWalkAway?: NegotiationRuntimeOptions["requireWalkAway"];
  allowAgentPortTtl?: NegotiationRuntimeOptions["allowAgentPortTtl"];
  defaultPortTtl: TtlSpec;
  validateBind?: ObpToolkitEnv["validateBind"];
  requestNegotiationEnd?: ObpToolkitEnv["requestNegotiationEnd"];
};

type PendingTurn = {
  partyId: string;
  auditCountAtPrepare: number;
  headOfferId: string | null;
  bindMenu: readonly NegotiationBindMenuEntry[];
};

/**
 * Bilateral contract for tool-loop agents: the agent uses OBP write tools (and
 * dynamic `obp_bind__<portId>` tools derived from the live bind menu) to mutate
 * the graph itself; this contract supplies the per-turn view + allowed-tool
 * whitelist and reconciles audits at the end of each turn.
 *
 * `apply` does not validate raw output — graph mutations happened via tool calls
 * during {@link RunAgentTurn}. Instead it returns the audit recorded since
 * {@link prepare} (when one of the structured contracts shares the ledger), or
 * synthesises a minimal noop audit so the {@link BilateralCoordinator} always
 * advances its turn counter.
 *
 * @experimental Hardened stub. The structured-bilateral contract
 * ({@link createNegotiationStructuredBilateralContract}) is the recommended
 * reference path; use this only when wiring an actual `ToolLoopAgent` driver
 * that calls OBP write tools directly.
 *
 * @see [Plan §1 — harden tool-loop bilateral](../../../../../.cursor/plans/close_three-layer_gaps_0e02e639.plan.md)
 */
export function createNegotiationToolLoopBilateralContract(
  opts: ToolLoopBilateralContractOptions,
): TurnContract<NegotiationTurnAudit> {
  const runtime = new NegotiationRuntime({
    client: opts.ledger.client,
    persistence: opts.ledger.persistence,
    ledgerSeq: opts.ledger.ledgerSeq,
    maxTurns: opts.ledger.maxTurns,
    ...(opts.requireNoop !== undefined ? { requireNoop: opts.requireNoop } : {}),
    ...(opts.requireWalkAway !== undefined ? { requireWalkAway: opts.requireWalkAway } : {}),
    ...(opts.allowAgentPortTtl !== undefined ? { allowAgentPortTtl: opts.allowAgentPortTtl } : {}),
    defaultPortTtl: opts.defaultPortTtl,
    ...(opts.validateBind !== undefined ? { validateBind: opts.validateBind } : {}),
    ...(opts.requestNegotiationEnd !== undefined
      ? { requestNegotiationEnd: opts.requestNegotiationEnd }
      : {}),
  });

  const extraTools = opts.extraAllowedToolNames ?? STATIC_ALLOWED_TOOLS;

  let pending: PendingTurn | null = null;

  return {
    async hasNoBindableCounterpartyPorts(partyId) {
      return runtime.hasNoBindableCounterpartyPorts(partyId);
    },

    async prepare(partyId): Promise<PreparedTurn<unknown>> {
      const snap = await runtime.getBindSnapshotForParty(partyId);
      const bindMenu = snap?.bindMenu ?? [];
      const headOfferId = snap?.headOfferId ?? null;

      const dynamicBindTools = bindMenu.map((b) => bindToolName(b.portId));
      const allowedToolNames = [...extraTools, ...dynamicBindTools];

      const userMessage = buildObpNegotiationUserMessage({
        ...(opts.scenario !== undefined ? { scenario: opts.scenario } : {}),
        partyRoleName: opts.partyRoleName(partyId),
        actingPartyId: partyId,
        graph: opts.getGraphSnapshot(),
        ...(opts.getPriorAuditsSummary !== undefined
          ? { priorAuditsSummary: opts.getPriorAuditsSummary() }
          : {}),
        turnBodyLines: [
          "Use OBP tools directly to advance the negotiation. You may extend a new offer, expose ports on it, bind a counterparty port via the contextual `obp_bind__<portId>` tools, or end the negotiation.",
          bindMenu.length === 0
            ? "(No counterparty bind targets right now — extend a new offer / expose ports, or end negotiation.)"
            : `Counterparty bind targets: ${bindMenu.map((b) => `${bindToolName(b.portId)} (${b.portType}${b.terminal ? ", terminal" : ""})`).join("; ")}.`,
          "",
        ],
      });

      pending = {
        partyId,
        auditCountAtPrepare: opts.ledger.completedTurns,
        headOfferId,
        bindMenu,
      };

      return {
        kind: "tool-loop",
        allowedToolNames,
        systemFragments: [],
        userMessage,
        metadata: {
          bindMenu,
          headOfferId,
        },
      };
    },

    async apply(partyId, _raw): Promise<NegotiationTurnAudit> {
      const p = pending;
      pending = null;

      // If the runner (or a sibling structured contract sharing this ledger) recorded
      // audits since prepare, return the most recent one — the tool loop did its work.
      if (opts.ledger.completedTurns > (p?.auditCountAtPrepare ?? 0)) {
        const last = opts.ledger.lastAudit();
        if (last !== undefined) {
          return last;
        }
      }

      // No audit was recorded during the tool loop. Synthesise a minimal noop bind
      // audit so the coordinator still advances its turn counter and downstream UI
      // can render the turn.
      // TODO(plan): derive a richer audit by diffing graph deltas (extend/expose/bind
      // edges added since `auditCountAtPrepare`) instead of always emitting a noop.
      const headOfferId = p?.headOfferId ?? "";
      const noop: NegotiationBindTurnAudit = {
        kind: "bind",
        turnIndex: opts.ledger.completedTurns,
        actingPartyId: partyId,
        chosenPortId: noopPortIdForHeadOffer(headOfferId),
        chosenPortType: "obp.agent-runtime/noop",
        headOfferId,
        counterpartyHeadOfferType: null,
        bindKind: "noop",
        bindMenu: [...(p?.bindMenu ?? [])],
        newOfferId: "",
        newOfferType: "",
        exposedPortIds: [],
        exposedPorts: [],
      };
      opts.ledger.recordAudit(noop);
      return noop;
    },
  };
}
