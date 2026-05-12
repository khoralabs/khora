import type { AgentRegistry, RegisteredAgentIdentity } from "@khoralabs/agent-identity";
import type { TurnBody } from "@khoralabs/obp-core";
import type {
  ObpNegotiatorPreparedTurn,
  ObpNegotiatorStructuredSessionInput,
  ObpNegotiatorStructuredSessionOutput,
} from "@khoralabs/obp-negotiator";
import type { LanguageModel } from "ai";

import type { ObpLedger } from "./ledger.ts";
import type { NegotiationTurnAudit } from "./runtime.ts";
import type { PreparedTurn, TurnContract } from "./turn-contract.ts";

/** Model + identity chosen for one structured negotiator turn (see {@link NegotiationActorResolver}). */
export type NegotiationActorBinding = {
  identity: RegisteredAgentIdentity;
  model: LanguageModel;
};

/** Hint for app-defined routing when multiple agents share a process or multiplex chains. */
export type NegotiationActorResolveHint = {
  partyId: string;
  chainSessionId?: string;
};

/** Resolve which agent speaks for `partyId` on this strand (in-process or wire). */
export type NegotiationActorResolver = (
  hint: NegotiationActorResolveHint,
) => NegotiationActorBinding | Promise<NegotiationActorBinding>;

/** Minimal session surface for sending turns / terminating after an inbound offer (wire adapters). */
export type NegotiatorWireSession = {
  sendTurn(body: TurnBody): Promise<void>;
  terminate(reason: string): Promise<void>;
};

export type DispatchNegotiatorIncomingOfferOptions = {
  ledger: ObpLedger<NegotiationTurnAudit>;
  contract: TurnContract<NegotiationTurnAudit>;
  partyId: string;
  registry: AgentRegistry;
  identity: RegisteredAgentIdentity;
  model: LanguageModel;
  budgetMs: number;
  session: NegotiatorWireSession;
  /** Prepended to stderr on agent failure (default `[obp-negotiator]`). */
  logPrefix?: string;
  onMaxTurns?: () => void | Promise<void>;
  onAgentTurnFailed?: (error: unknown) => void | Promise<void>;
};

export function preparedToNegotiatorTurn(p: PreparedTurn<unknown>): ObpNegotiatorPreparedTurn {
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

export async function runStructuredNegotiatorTurn(args: {
  registry: AgentRegistry;
  identity: RegisteredAgentIdentity;
  contract: TurnContract<NegotiationTurnAudit>;
  partyId: string;
  model: LanguageModel;
  budgetMs: number;
}): Promise<{ audit: NegotiationTurnAudit; raw: unknown; turn: TurnBody }> {
  const prepared = await args.contract.prepare(args.partyId);
  if (prepared.kind !== "structured") {
    throw new Error("runStructuredNegotiatorTurn: expected structured contract turn");
  }

  const session = args.registry.createSession(args.identity.agentId, {
    ctx: {
      model: args.model,
      prepared: preparedToNegotiatorTurn(prepared),
      budgetMs: args.budgetMs,
    },
  });
  const { output } = await session.start<
    ObpNegotiatorStructuredSessionInput,
    ObpNegotiatorStructuredSessionOutput
  >({});
  const audit = await args.contract.apply(args.partyId, output);
  return { audit, raw: output, turn: audit.committedTurnBody } as const;
}

/** True when the acting party bound a counterparty terminal port (deal-shaped close). */
export function terminalAgreement(audit: NegotiationTurnAudit): boolean {
  if (audit.kind !== "bind" || audit.bindKind !== "real") {
    return false;
  }
  const chosen = audit.bindMenu.find((b) => b.portId === audit.chosenPortId);
  return chosen?.terminal === true;
}

export function negotiationShouldEnd(audit: NegotiationTurnAudit): boolean {
  if (audit.kind === "bind" && audit.bindKind === "walkAway") {
    return true;
  }
  return terminalAgreement(audit);
}

export async function dispatchNegotiatorIncomingOffer(
  opts: DispatchNegotiatorIncomingOfferOptions,
): Promise<void> {
  const prefix = opts.logPrefix ?? "[obp-negotiator]";
  if (opts.ledger.isExhausted()) {
    await opts.session.terminate("max_turns");
    await opts.onMaxTurns?.();
    return;
  }
  try {
    const { audit } = await runStructuredNegotiatorTurn({
      registry: opts.registry,
      identity: opts.identity,
      contract: opts.contract,
      partyId: opts.partyId,
      model: opts.model,
      budgetMs: opts.budgetMs,
    });
    if (negotiationShouldEnd(audit) || opts.ledger.isExhausted()) {
      await opts.session.terminate("done");
    }
  } catch (e: unknown) {
    console.error(`${prefix} agent turn failed:`, e);
    await opts.onAgentTurnFailed?.(e);
    await opts.session.terminate("agent_error");
  }
}
