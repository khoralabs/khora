import { createRegisteredAgentIdentity, type RegisteredAgentIdentity } from "@cfd/agent-identity";
import { obpToolkit } from "@cfd/obp-tools";
import { buildObpNegotiatorBaseInstruction } from "./instructions.ts";

export const OBP_NEGOTIATOR_AGENT_ID = "obp-negotiator";

export function buildObpNegotiatorAgentId(namespace: string): string {
  return `${OBP_NEGOTIATOR_AGENT_ID}-${namespace}`;
}

export type DefineObpNegotiatorIdentityOptions = {
  /** Display name for tooling (default: "OBP Negotiator"). */
  name?: string;
  /** Merged into \`createRegisteredAgentIdentity\` context. */
  identityContext?: Record<string, unknown>;
  /** Additional instructions to merge into the base instruction. */
  instructions?: string[];
};

/**
 * Registered identity: OBP toolkit + negotiator base instructions.
 * Use distinct namespaces (e.g. buyer vs seller) when multiple agents share a host.
 */
export async function defineObpNegotiatorIdentity(
  namespace: string,
  options?: DefineObpNegotiatorIdentityOptions,
): Promise<{ staticHash: string; identity: RegisteredAgentIdentity }> {
  return createRegisteredAgentIdentity({
    agentId: buildObpNegotiatorAgentId(namespace),
    name: options?.name ?? "OBP Negotiator",
    instructions: [...(options?.instructions ?? []), buildObpNegotiatorBaseInstruction()],
    context: {
      role: "obp-negotiator",
      targetNamespace: namespace,
      ...(options?.identityContext ?? {}),
    },
    rootComposable: obpToolkit,
  });
}
