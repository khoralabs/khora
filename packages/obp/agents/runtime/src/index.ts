export type { GraphSnapshot } from "@cfd/obp-core";
export {
  isRuntimeNoopPortId,
  isRuntimeWalkAwayPortId,
  noopPortIdForHeadOffer,
  OBP_AGENT_RUNTIME_NOOP_PORT_TYPE,
  OBP_AGENT_RUNTIME_NOOP_PREFIX,
  OBP_AGENT_RUNTIME_WALK_AWAY_PORT_TYPE,
  OBP_AGENT_RUNTIME_WALK_AWAY_PREFIX,
  OBP_NEGOTIATION_BIND_NO_POLICY,
  walkAwayPortIdForHeadOffer,
} from "./constants.ts";
export {
  createNegotiationStructuredBilateralContract,
  type StructuredBilateralContractOptions,
} from "./contracts/structured-bilateral.ts";
export {
  createNegotiationToolLoopBilateralContract,
  type ToolLoopBilateralContractOptions,
} from "./contracts/tool-loop-bilateral.ts";
export {
  BilateralCoordinator,
  type BilateralCoordinatorOptions,
  type RunAgentTurn,
  type RunNextTurnResult,
} from "./coordinator/bilateral.ts";
export {
  createNegotiationAgent,
  type NegotiationToolSet,
} from "./create-agent.ts";
export { ObpLedger, type ObpLedgerOptions } from "./ledger.ts";
export { createNegotiationLedgerAndStructuredContract } from "./negotiation-ledger-contract.ts";
export {
  type DispatchNegotiatorIncomingOfferOptions,
  dispatchNegotiatorIncomingOffer,
  type NegotiationActorBinding,
  type NegotiationActorResolveHint,
  type NegotiationActorResolver,
  type NegotiatorWireSession,
  negotiationShouldEnd,
  preparedToNegotiatorTurn,
  runStructuredNegotiatorTurn,
  terminalAgreement,
} from "./negotiator-turn.ts";
export {
  filterPortIdsByNegotiationTurnTtl,
  minExposeSeqOnOffer,
  portEligibleForBindAtTurn,
  portExpiredForSnapshot,
} from "./port-turn-ttl.ts";
export {
  type BuildObpNegotiationUserMessageArgs,
  buildObpNegotiationUserMessage,
  formatBindMenuForPrompt,
  formatGraphSnapshotForPrompt,
  type GraphSnapshotForPrompt,
} from "./prompt.ts";
export { formatNegotiationProviderError } from "./provider-error.ts";
export {
  type NegotiationBindMenuEntry,
  type NegotiationBindTurnAudit,
  type NegotiationExposedPortSummary,
  type NegotiationGenesisTurnAudit,
  /**
   * @deprecated Prefer {@link createNegotiationStructuredBilateralContract} +
   * {@link BilateralCoordinator} + {@link ObpLedger}. Re-exported for the
   * low-level escape hatch only; will be hidden in a follow-up release.
   */
  NegotiationRuntime,
  /** @deprecated See {@link NegotiationRuntime}. */
  type NegotiationRuntimeOptions,
  type NegotiationTurnAudit,
} from "./runtime.ts";
export {
  ensureRuntimeSyntheticPorts,
  isPortExposedOnOffer,
  newestCounterpartyExposedOfferId,
  resolveHeadOfferIdForSyntheticPorts,
} from "./system-ports.ts";
export { expiresSeqForOfferTtl, expiresSeqForPortTtl } from "./ttl-resolve.ts";
export { type TtlBasis, type TtlSpec, zTtlSpec } from "./ttl-spec.ts";
export type { PreparedTurn, TurnContract } from "./turn-contract.ts";
export {
  buildGenesisNegotiationTurnOutput,
  buildNegotiationTurnOutput,
  type NegotiationBindSchemaMenuEntry,
  type NegotiationGenesisTurnOutput,
  type NegotiationTurnExposePort,
  type NegotiationTurnOutput,
  type NegotiationTurnSchemaOptions,
} from "./turn-output-schema.ts";
export { auditToTurnBody } from "./wire-bridge.ts";
