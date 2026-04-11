import { createRegisteredAgentIdentity, type RegisteredAgentIdentity } from "@cfd/agent-identity";
import type { LabelSchemaMap, OntologyDefinition } from "@cfd/memories-core";
import {
  buildLibrarianBaseSystemContent,
  buildLibrarianMergePlanInstruction,
} from "./instructions";
import { memoryLibrarianToolkit } from "./toolkit";

/** Stable librarian agent id for registry / fingerprinting. */
export const MEMORY_LIBRARIAN_AGENT_ID = "memory-librarian";
export function buildMemoryLibrarianAgentId(namespace: string): string {
  return `${MEMORY_LIBRARIAN_AGENT_ID}-${namespace}`;
}

/**
 * Static agent identity for the memory librarian (merge-plan instruction, base system, toolkit).
 * For identity plus default `registry.register` options in one step, use `declareMemoryLibrarianAgent` (`./declaration.ts`).
 */
export async function defineMemoryLibrarianIdentity<
  TNode extends LabelSchemaMap,
  TEdge extends LabelSchemaMap,
>(
  namespace: string,
  ontology: OntologyDefinition<TNode, TEdge>,
): Promise<{
  staticHash: string;
  identity: RegisteredAgentIdentity;
}> {
  return createRegisteredAgentIdentity({
    agentId: buildMemoryLibrarianAgentId(namespace),
    name: "Memory Librarian",
    instructions: [buildLibrarianMergePlanInstruction(ontology), buildLibrarianBaseSystemContent()],
    rootComposable: memoryLibrarianToolkit,
  });
}
