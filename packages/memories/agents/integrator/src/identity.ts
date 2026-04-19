import { createRegisteredAgentIdentity, type RegisteredAgentIdentity } from "@cfd/agent-identity";
import { memorySearchToolkit } from "@cfd/memories-tools";
import { buildMemoryIntegratorBaseInstruction } from "./instructions.js";

export const MEMORY_INTEGRATOR_AGENT_ID = "memory-integrator";

export function buildMemoryIntegratorAgentId(namespace: string): string {
  return `${MEMORY_INTEGRATOR_AGENT_ID}-${namespace}`;
}

export type DefineMemoryIntegratorIdentityOptions = {
  /** Merged into \`createRegisteredAgentIdentity\` context. */
  identityContext?: Record<string, unknown>;
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
    instructions: [buildMemoryIntegratorBaseInstruction()],
    context: {
      role: "memory-integrator",
      targetNamespace: namespace,
      ...(options?.identityContext ?? {}),
    },
    rootComposable: memorySearchToolkit,
  });
}
