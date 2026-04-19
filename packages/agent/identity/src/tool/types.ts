import type { StandardSchemaV1 } from "../standard-schema.js";

/**
 * Per-invocation context passed to {@link ToolSpec.handler}. Same shape as {@link ToolkitContext}
 * (typically the env slice used when the tool runs).
 */
export type ToolRuntimeContext<Env = unknown> = {
  env: Env;
  namespace?: string;
  agentId?: string;
  agentName?: string;
};

/**
 * Runtime tool shape. {@link ToolSpec.handler} uses {@link ToolRuntimeContext} with erased
 * {@code env} so merged tool maps stay compositional; use {@link tool}’s {@code Env} generic for a
 * typed handler at definition time.
 */
export type ToolSpec = {
  name: string;
  description?: string;
  inputSchema: StandardSchemaV1;
  instructions: string;
  /** Sorted policy ids gating this tool (for runtime hashing parity with static tool hash). */
  policyIds?: string[];
  handler: (
    ctx: ToolRuntimeContext<unknown>,
    input: unknown,
    options?: unknown,
  ) => Promise<unknown> | AsyncIterable<unknown>;
};
