import type { IdentityLink } from "../agent/identity-link.js";

/**
 * Whether serialized policy results are ground truth for replay (`authoritative`) or advisory (`hint`).
 * @see PolicyEvaluationSnapshot
 */
export type PolicySnapshotMode = "authoritative" | "hint";

/**
 * JSON-safe policy evaluation closure at capture time (no `SharedPolicy` objects).
 */
export type PolicyEvaluationSnapshot = {
  mode: PolicySnapshotMode;
  /** Policy id → allowed (same information as a frozen {@link PolicyResultMap} lookup by id). */
  results: Record<string, boolean>;
  /** Epoch ms when captured (optional audit). */
  capturedAt?: number;
  /** Host-defined bundle or config revision (optional audit). */
  policyBundleId?: string;
  /** Policy engine / ruleset version (optional audit). */
  policyEngineVersion?: string;
};

/**
 * Serializable tool definition (no handler). Aligns with Smithy `ToolSpecWire` and
 * {@link toolSpecCanonicalPayload} field semantics.
 */
export type ToolSpecWire = {
  name: string;
  description: string;
  /** Same string as {@link ToolSpec.instructions}; split on `\\n\\n` for canonical hashing. */
  instructions: string;
  /** Same shape as {@link schemaToHashInput} output (JSON Schema or vendor stub). */
  inputSchema: unknown;
  /** Sorted policy ids (runtime hashing parity). */
  policyIds: string[];
};

/**
 * Post-evaluation affordances without handlers (interchange + persistence).
 */
export type RegisteredAgentAffordancesWire = {
  instructions: string;
  tools: Record<string, ToolSpecWire>;
};

/**
 * Agent static snapshot without composable tree (Smithy `RegisteredAgentIdentityWire`).
 */
export type RegisteredAgentIdentityWire = {
  agentId: string;
  name: string;
  staticHash: string;
  staticInstructions: string[];
  staticContext: Record<string, unknown>;
};

/**
 * Runtime slice: identity link + tool refs + affordances + policy closure + toolkit context.
 */
export type AgentRuntimeSnapshot = {
  identity: IdentityLink;
  toolRefs: Array<{ toolKey: string; toolHash: string }>;
  affordances: RegisteredAgentAffordancesWire;
  policy: PolicyEvaluationSnapshot;
  /** JSON-safe subset of {@link ToolkitContext} (e.g. env keys you persist); handlers omitted. */
  toolkitContext: Record<string, unknown>;
};

/**
 * Versioned envelope for independent serialization of static / policy / runtime / session context.
 */
export type AgentSnapshotEnvelope = {
  schemaVersion: string;
  static?: RegisteredAgentIdentityWire;
  policy?: PolicyEvaluationSnapshot;
  runtime?: AgentRuntimeSnapshot;
  /** Session or host context not covered elsewhere. */
  context?: Record<string, unknown>;
};
