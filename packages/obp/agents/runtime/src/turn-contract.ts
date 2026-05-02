import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { z } from "zod";

/**
 * What the orchestrator hands an agent for one turn: a view of the world plus the
 * shape its response must satisfy. Structural — no agent-identity dep — so any
 * runner (registry session, raw `generateObject`, or a tool-loop driver) can consume.
 */
export type PreparedTurn<TOutput = unknown> = {
  /** "structured" → agent emits a JSON object; "tool-loop" → agent calls allowed tools. */
  kind: "structured" | "tool-loop";
  /** Authoritative output schema for structured turns (Standard Schema). */
  outputSchema?: StandardSchemaV1<TOutput>;
  /**
   * Same schema expressed as Zod when available, so AI SDK helpers like
   * {@code generateObject} or {@code Output.object} can consume it directly. Optional —
   * runners that only consume Standard Schema may ignore.
   */
  zodOutputSchema?: z.ZodType<TOutput>;
  /** For tool-loop turns: the names of OBP tools the agent is allowed to invoke this turn. */
  allowedToolNames?: readonly string[];
  /** Lines that should be appended to the agent's system instruction for this turn. */
  systemFragments: readonly string[];
  /** The user message rendering this party's view of the negotiation. */
  userMessage: string;
  /**
   * Optional per-contract metadata (e.g. structured-output object name + description for
   * Vercel AI SDK's `Output.object`). Opaque to the coordinator.
   */
  metadata?: Record<string, unknown>;
};

/**
 * Per-agent view + intent. Reads the shared {@link ObpLedger} party-scoped, then
 * validates and atomically applies the agent's output.
 *
 * Implementations own the OBP graph mutations; the coordinator owns sequencing.
 */
export interface TurnContract<TAudit> {
  /** Build the per-turn view + output contract for {@code partyId}. */
  prepare(partyId: string): Promise<PreparedTurn<unknown>>;
  /** Validate raw agent output and atomically apply it to the shared ledger. */
  apply(partyId: string, raw: unknown): Promise<TAudit>;
  /** Cheap probe used by coordinators to detect an empty graph (genesis-turn case). */
  hasNoBindableCounterpartyPorts?(partyId: string): Promise<boolean>;
}
