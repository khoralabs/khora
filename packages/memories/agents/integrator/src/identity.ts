import { createRegisteredAgentIdentity, type RegisteredAgentIdentity } from "@khoralabs/agent-identity";
import { memorySearchToolkit } from "@khoralabs/memories-tools";
import { memoryIntegratorBaseInstruction } from "./instructions.js";

export const MEMORY_INTEGRATOR_AGENT_ID = "memory-integrator";

export function buildMemoryIntegratorAgentId(namespace: string): string {
  return `${MEMORY_INTEGRATOR_AGENT_ID}-${namespace}`;
}

export type DefineMemoryIntegratorIdentityOptions = {
  /** Merged into \`createRegisteredAgentIdentity\` context. */
  identityContext?: Record<string, unknown>;
  /** Additional static instruction blocks prepended before the integrator base instruction. */
  instructions?: string[];
};

/**
 * Static agent identity: memory search toolkit + integrator instructions (structured MemoryIntegratorPlan).
 */
export async function defineMemoryIntegratorIdentity(
  namespace: string,
  options?: DefineMemoryIntegratorIdentityOptions,
): Promise<{ staticHash: string; identity: RegisteredAgentIdentity }> {
  return createRegisteredAgentIdentity({
    agentId: buildMemoryIntegratorAgentId(namespace),
    name: "Memory Integrator",
    instructions: [...(options?.instructions ?? []), memoryIntegratorBaseInstruction],
    context: {
      role: "memory-integrator",
      targetNamespace: namespace,
      ...(options?.identityContext ?? {}),
    },
    rootComposable: memorySearchToolkit,
  });
}
