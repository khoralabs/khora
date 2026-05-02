import type { ObpToolkitEnv } from "@cfd/obp-tools";
import { OBP_NEGOTIATION_BIND_NO_POLICY } from "../constants.ts";
import type { ObpLedger } from "../ledger.ts";
import {
  buildObpNegotiationUserMessage,
  formatBindMenuForPrompt,
  type GraphSnapshotForPrompt,
} from "../prompt.ts";
import {
  NegotiationRuntime,
  type NegotiationRuntimeOptions,
  type NegotiationTurnAudit,
} from "../runtime.ts";
import type { TtlSpec } from "../ttl-spec.ts";
import type { PreparedTurn, TurnContract } from "../turn-contract.ts";

export type StructuredBilateralContractOptions = {
  ledger: ObpLedger<NegotiationTurnAudit>;
  /** Map a party id to a human role label rendered in the user message header. */
  partyRoleName: (partyId: string) => string;
  /** Optional scenario block (joint goal, conventions). Empty when omitted. */
  scenario?: string;
  /** Lazy snapshot builder; called once per {@link prepare}. */
  getGraphSnapshot: () => GraphSnapshotForPrompt;
  /** Optional summary of prior turns to inline in the user message. */
  getPriorAuditsSummary?: () => string;
  requireNoop?: NegotiationRuntimeOptions["requireNoop"];
  requireWalkAway?: NegotiationRuntimeOptions["requireWalkAway"];
  allowAgentPortTtl?: NegotiationRuntimeOptions["allowAgentPortTtl"];
  defaultPortTtl: TtlSpec;
  validateBind?: ObpToolkitEnv["validateBind"];
  requestNegotiationEnd?: ObpToolkitEnv["requestNegotiationEnd"];
};

const GENESIS_BODY_LINES = [
  "**Opening move:** there is no counterparty offer to bind yet. Propose your initial public state (`offerType`) and expose the ports your counterpart may bind next.",
  "",
];

const GENESIS_OUTPUT_DESCRIPTION =
  "Opening move: set your root offerType (public state) and expose one or more ports. Each port requires a non-empty `description` (counterparty-facing copy), `portType`, and `terminal`. Optional `bind_policy` means future binds must supply matching policy-shaped fields on that port’s key. No bind yet.";

function bindOutputDescription(): string {
  return `Structured negotiation: set **exactly one** JSON property whose key is a **port id** from the bind menu (see user message). Use value **"${OBP_NEGOTIATION_BIND_NO_POLICY}"** for ports without bind policy, or the **policy-shaped object** when that port has \`bind_policy\`. Set \`offerType\` to your new public state after that bind. If the chosen port is **terminal**, omit \`ports\` entirely. Otherwise you may optionally list new \`ports\` (each with required \`description\`).`;
}

/**
 * Bilateral structured-output contract: agent emits a single JSON object that
 * either opens negotiation (genesis) or binds exactly one counterparty port.
 *
 * Genesis vs bind is decided from graph state — if {@code partyId} has no bindable
 * counterparty ports, this turn is a genesis. Otherwise it is a bind.
 *
 * Wraps {@link NegotiationRuntime} for graph mutation; {@link ObpLedger} owns the
 * shared turn counter and audit tail.
 */
export function createNegotiationStructuredBilateralContract(
  opts: StructuredBilateralContractOptions,
): TurnContract<NegotiationTurnAudit> {
  const runtime = new NegotiationRuntime({
    client: opts.ledger.client,
    persistence: opts.ledger.persistence,
    now: opts.ledger.now,
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

  let pendingKind: "genesis" | "bind" | null = null;

  return {
    async hasNoBindableCounterpartyPorts(partyId) {
      return runtime.hasNoBindableCounterpartyPorts(partyId);
    },

    async prepare(partyId): Promise<PreparedTurn<unknown>> {
      const isGenesis = await runtime.hasNoBindableCounterpartyPorts(partyId);

      const headerArgs = {
        ...(opts.scenario !== undefined ? { scenario: opts.scenario } : {}),
        partyRoleName: opts.partyRoleName(partyId),
        actingPartyId: partyId,
        graph: opts.getGraphSnapshot(),
        ...(opts.getPriorAuditsSummary !== undefined
          ? { priorAuditsSummary: opts.getPriorAuditsSummary() }
          : {}),
      };

      if (isGenesis) {
        const { schema } = await runtime.prepareGenesisTurn(partyId);
        pendingKind = "genesis";
        const userMessage = buildObpNegotiationUserMessage({
          ...headerArgs,
          turnBodyLines: GENESIS_BODY_LINES,
        });
        return {
          kind: "structured",
          zodOutputSchema: schema,
          systemFragments: [],
          userMessage,
          metadata: {
            outputName: "GenesisNegotiationTurn",
            outputDescription: GENESIS_OUTPUT_DESCRIPTION,
          },
        };
      }

      const prep = await runtime.prepareActingTurn(partyId);
      pendingKind = "bind";
      const userMessage = buildObpNegotiationUserMessage({
        ...headerArgs,
        turnBodyLines: [
          "Choose exactly one counterparty affordance: your JSON must include **one** top-level key equal to a **port id** from the list below (opaque UUIDs are intentional). The schema's `.description` on that key repeats the affordance text.",
          "Ports marked **terminal**: your structured response must **not** include a `ports` field.",
          "**Bind choices (port id → type → description):**",
          formatBindMenuForPrompt(prep.bindMenu),
          "",
        ],
      });
      const headOfferRes = opts.ledger.client.getOffer(prep.headOfferId);
      const counterpartyHeadOfferType =
        headOfferRes.kind === "found" ? headOfferRes.offer.type : null;
      return {
        kind: "structured",
        zodOutputSchema: prep.schema,
        systemFragments: [],
        userMessage,
        metadata: {
          outputName: "NegotiationTurn",
          outputDescription: bindOutputDescription(),
          bindMenu: prep.bindMenu,
          headOfferId: prep.headOfferId,
          counterpartyHeadOfferType,
        },
      };
    },

    async apply(partyId, raw): Promise<NegotiationTurnAudit> {
      const k = pendingKind;
      if (k === null) {
        throw new Error(
          "structured-bilateral contract: apply() called before prepare() (no pending turn)",
        );
      }
      pendingKind = null;
      const audit =
        k === "genesis" ? runtime.applyGenesisTurn(partyId, raw) : runtime.applyTurn(partyId, raw);
      opts.ledger.recordAudit(audit);
      return audit;
    },
  };
}
