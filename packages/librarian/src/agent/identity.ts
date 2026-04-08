import { createRegisteredAgentIdentity, type RegisteredAgentIdentity } from "@cfd/agent-identity";
import { LIBRARIAN_STATIC_SYSTEM_INSTRUCTIONS } from "./instructions/static";
import { memoryLibrarianToolkit } from "./toolkit";

/** Stable librarian agent id for registry / fingerprinting. */
export const MEMORY_LIBRARIAN_AGENT_ID = "memory-librarian";
export function buildMemoryLibrarianAgentId(namespace: string): string {
  return `${MEMORY_LIBRARIAN_AGENT_ID}-${namespace}`;
}

/**
 * Static agent identity for the memory librarian (toolkit + {@link LIBRARIAN_STATIC_SYSTEM_INSTRUCTIONS}).
 */
export async function defineMemoryLibrarianIdentity(namespace: string): Promise<{
  staticHash: string;
  identity: RegisteredAgentIdentity;
}> {
  return createRegisteredAgentIdentity({
    agentId: buildMemoryLibrarianAgentId(namespace),
    name: "Memory Librarian",
    instructions: [LIBRARIAN_STATIC_SYSTEM_INSTRUCTIONS],
    rootComposable: memoryLibrarianToolkit,
  });
}
