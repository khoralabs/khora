import type { Composable } from "../toolkit/types.js";
import type { ToolSpec } from "../tool/types.js";

/**
 * Definition-time metadata for a registered agent (parallel to {@link ToolStaticProps}).
 * Introspect without evaluating; also available from {@link AgentRegistry.get}.
 */
export type AgentStaticProps = {
  kind: "registered-agent";
  agentId: string;
  name: string;
  /** Same lines as {@link RegisteredAgentIdentity.staticInstructions}; kept for display/registry. */
  instructions: string[];
  /** Default static context merged first in a session. */
  context?: Record<string, unknown>;
};

export type RegisteredAgentIdentity = {
  agentId: string;
  name: string;
  /** Pre-computed from root composable via bottom-up hashing. */
  staticHash: string;
  staticProps: AgentStaticProps;
  /** Agent-level static instruction lines; compiled with toolkit evaluation at runtime. */
  staticInstructions: string[];
  /** Default session context merged before registry/session context additions. */
  staticContext: Record<string, unknown>;
  rootComposable: Composable<{ kind: string; name: string }, Record<string, ToolSpec>, unknown>;
};
