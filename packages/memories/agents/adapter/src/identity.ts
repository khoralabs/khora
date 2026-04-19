import { createRegisteredAgentIdentity, type RegisteredAgentIdentity } from "@cfd/agent-identity";
import { memorySearchToolkit } from "@cfd/memories-tools";
import { buildMemoryAdapterBaseInstruction } from "./instructions.js";

export const MEMORY_ADAPTER_AGENT_ID = "memory-adapter";

export function buildMemoryAdapterAgentId(namespace: string): string {
  return `${MEMORY_ADAPTER_AGENT_ID}-${namespace}`;
}

export type DefineMemoryAdapterIdentityOptions = {
  /** Merged into \`createRegisteredAgentIdentity\` context (deployment / tenant / product vocabulary). */
  identityContext?: Record<string, unknown>;
};

/**
 * Static agent identity for the memory adapter (same hybrid search toolkit as the librarian for retrieval).
 */
export async function defineMemoryAdapterIdentity(
  namespace: string,
  options?: DefineMemoryAdapterIdentityOptions,
): Promise<{ staticHash: string; identity: RegisteredAgentIdentity }> {
  return createRegisteredAgentIdentity({
    agentId: buildMemoryAdapterAgentId(namespace),
    name: "Memory Adapter",
    instructions: [buildMemoryAdapterBaseInstruction()],
    context: {
      role: "memory-adapter",
      targetNamespace: namespace,
      ...(options?.identityContext ?? {}),
    },
    rootComposable: memorySearchToolkit,
  });
}
