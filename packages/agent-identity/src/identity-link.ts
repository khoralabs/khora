import { computeRuntimeHash } from "./runtime-hashes.js";
import type { RegisteredAgentIdentity, ToolSpec } from "./types.js";

/**
 * Pure attribution record: links an agent's static capacity to the runtime effective identity.
 */
export type IdentityLink = {
  agentId: string;
  agentName: string;
  staticHash: string;
  runtimeHash: string;
};

export type CreateIdentityLinkArgs = {
  agent: RegisteredAgentIdentity;
  /** Tool names enabled this turn (e.g. `Object.keys(evaluated.tools)`). */
  enabledToolNames: string[];
  /** From {@link collectToolStaticHashes} on the root composable. */
  nameToStaticHash: Map<string, string>;
  /** For dynamic-only tools not in the static map. */
  tools: Record<string, ToolSpec>;
};

export async function createIdentityLink(
  args: CreateIdentityLinkArgs,
): Promise<IdentityLink> {
  const runtimeHash = await computeRuntimeHash(
    args.enabledToolNames,
    args.nameToStaticHash,
    args.tools,
  );
  return {
    agentId: args.agent.agentId,
    agentName: args.agent.name,
    staticHash: args.agent.staticHash,
    runtimeHash,
  };
}
