import { createRegisteredAgentIdentity, type RegisteredAgentIdentity } from "@cfd/agent-identity";
import { buildLibrarianBaseSystemContent } from "./instructions/system";
import { memoryLibrarianToolkit } from "./toolkit";

/** Stable librarian agent id for registry / fingerprinting. */
export const MEMORY_LIBRARIAN_AGENT_ID = "memory-librarian";
export function buildMemoryLibrarianAgentId(namespace: string): string {
  return `${MEMORY_LIBRARIAN_AGENT_ID}-${namespace}`;
}

/**
 * Static agent identity for the memory librarian (toolkit + {@link buildLibrarianBaseSystemContent}).
 * For identity plus default `registry.register` options in one step, use `declareMemoryLibrarianAgent` (`./declaration.ts`).
 */
export async function defineMemoryLibrarianIdentity(namespace: string): Promise<{
  staticHash: string;
  identity: RegisteredAgentIdentity;
}> {
  return createRegisteredAgentIdentity({
    agentId: buildMemoryLibrarianAgentId(namespace),
    name: "Memory Librarian",
    instructions: [buildLibrarianBaseSystemContent()],
    rootComposable: memoryLibrarianToolkit,
  });
}
