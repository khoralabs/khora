import type { PolicyResultMap, SharedPolicy, ToolPipelineHooks } from "../policy/types.js";
import type { ToolSpec } from "../tool/types.js";

export type ToolkitContext<Env = unknown> = {
  env: Env;
  namespace?: string;
  agentId?: string;
  agentName?: string;
  /** Runtime-level hooks (merged last with toolkit + tool hooks). */
  pipelineHooks?: ToolPipelineHooks;
  /** Hooks accumulated from parent toolkit {@code hooks} options (excludes {@link pipelineHooks}). */
  inheritedPipelineHooks?: ToolPipelineHooks;
};

export type ToolkitResult<TOOLS extends Record<string, ToolSpec> = Record<string, ToolSpec>> = {
  tools: TOOLS;
  instructions: string;
};

export type Composable<
  STATIC_PROPS extends { kind: string; name: string } = {
    kind: string;
    name: string;
  },
  TOOLS extends Record<string, ToolSpec> = Record<string, ToolSpec>,
  Env = unknown,
> = {
  staticProps: STATIC_PROPS;
  policies: SharedPolicy[];
  /** Bottom-up SHA-256 of this node's semantic identity (max potential affordances). */
  computeStaticHash: () => Promise<string>;
  evaluate: (
    ctx: ToolkitContext<Env>,
    resolvedPolicies?: PolicyResultMap,
  ) => Promise<ToolkitResult<TOOLS>>;
};
