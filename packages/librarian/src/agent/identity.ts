import { defineAgentIdentity } from "@cfd/agent-identity";
import { memoryLibrarianToolkit } from "./toolkit";

/** Stable librarian agent id for registry / fingerprinting. */
export const MEMORY_LIBRARIAN_AGENT_ID = "memory-librarian";
export function buildMemoryLibrarianAgentId(namespace: string): string {
  return `${MEMORY_LIBRARIAN_AGENT_ID}-${namespace}`;
}

/**
 * Fingerprint the memory librarian toolkit and register identity (same pattern as agent-identity examples).
 */
export async function defineMemoryLibrarianIdentity(namespace: string): Promise<{
  staticHash: string;
  identity: ReturnType<typeof defineAgentIdentity>;
}> {
  const staticHash = await memoryLibrarianToolkit.computeStaticHash();
  return {
    staticHash,
    identity: defineAgentIdentity({
      agentId: buildMemoryLibrarianAgentId(namespace),
      name: "Memory Librarian",
      staticHash,
    }),
  };
}
