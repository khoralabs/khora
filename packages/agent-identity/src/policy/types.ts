/** Policy nodes are deduped by object identity in a Map (same as Convex sharedPolicy). */
export type SharedPolicy = {
  readonly id: string;
  readonly evaluate: (env: unknown) => Promise<boolean>;
};

/** Where policy evaluation ran (for {@link ToolPipelineHooks.onPolicyEvaluated}). */
export type PolicyEvaluatedPhase = "toolkit" | "tool" | "dynamicToolkit";

export type PolicyEvaluatedPayload = {
  ok: boolean;
  policyId: string;
  phase: PolicyEvaluatedPhase;
  /** Set when {@link phase} is {@code tool}. */
  toolName?: string;
  /** Parent toolkit / dynamic toolkit name when applicable. */
  composableName?: string;
  /** Present when {@link ok} is false. */
  error?: string;
};

export type ToolExecutedPayload = {
  ok: boolean;
  toolName: string;
  input: unknown;
  output?: unknown;
  error?: string;
  durationMs?: number;
};

/**
 * Hook payloads use {@code env: unknown} so {@link ToolkitContext} stays assignable across
 * {@code Env} (e.g. {@code {}} vs {@code unknown}) without contravariance on pipeline hooks.
 */
export type ToolPipelineHooks = {
  onPolicyEvaluated?: (event: PolicyEvaluatedPayload & { env: unknown }) => void | Promise<void>;
  onToolExecuted?: (event: ToolExecutedPayload & { env: unknown }) => void | Promise<void>;
};

export type PolicyResultMap = Map<SharedPolicy, boolean>;
