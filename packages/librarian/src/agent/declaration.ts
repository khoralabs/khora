import type {
  AgentRegistry,
  RegisterAgentOptions,
  RegisteredAgentIdentity,
} from "@cfd/agent-identity";
import type { OntologyDefinition } from "@cfd/memories";
import type z from "zod";
import { defineMemoryLibrarianIdentity } from "./identity.js";
import {
  type MemoryLibrarianSessionContext,
  type MemoryLibrarianSessionInput,
  type MemoryLibrarianSessionOutput,
  memoryLibrarianRegistryRegistration,
} from "./memory-librarian-session.js";

/**
 * Single declarative bundle for the memory librarian: {@link RegisteredAgentIdentity} plus
 * {@link RegisterAgentOptions} for {@link AgentRegistry.register} — the session runner (`SessionRunner`)
 * and session `onAfterContext` wiring for toolkit/runtime contexts. This is not where toolkit pipeline
 * hooks (`onPolicyEvaluated` / `onToolExecuted`) live; those attach to toolkits/tools or `ToolkitContext.pipelineHooks`.
 */
/** Identity plus default `register` options (session runner + session hooks). */
export type MemoryLibrarianAgentDeclaration<
  TNode extends Record<string, z.ZodType> = Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType> = Record<string, z.ZodType>,
> = {
  staticHash: string;
  identity: RegisteredAgentIdentity;
  /** Pass verbatim: {@code registry.register(identity, registration)}. */
  registration: RegisterAgentOptions<
    MemoryLibrarianSessionInput<TNode, TEdge>,
    MemoryLibrarianSessionOutput,
    MemoryLibrarianSessionContext<TNode, TEdge>
  >;
};

/**
 * Declares the memory librarian agent for a namespace: static identity (toolkit + instructions) and
 * default registration options (`run` + session hooks). Orchestration lives in the session runner;
 * toolkit evaluation and optional pipeline hooks use `ToolkitContext` inside that runner.
 */
export async function declareMemoryLibrarianAgent<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
>(
  namespace: string,
  ontology: OntologyDefinition<TNode, TEdge>,
): Promise<MemoryLibrarianAgentDeclaration<TNode, TEdge>> {
  const { staticHash, identity } = await defineMemoryLibrarianIdentity(namespace, ontology);
  return {
    staticHash,
    identity,
    registration: memoryLibrarianRegistryRegistration<TNode, TEdge>(),
  };
}

/**
 * Registers the memory librarian for {@code namespace} on {@code registry} using the same declaration
 * as {@link declareMemoryLibrarianAgent}.
 */
export async function registerMemoryLibrarianAgent<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
>(
  registry: AgentRegistry,
  namespace: string,
  ontology: OntologyDefinition<TNode, TEdge>,
): Promise<MemoryLibrarianAgentDeclaration<TNode, TEdge>> {
  const declaration = await declareMemoryLibrarianAgent<TNode, TEdge>(namespace, ontology);
  registry.register(declaration.identity, declaration.registration);
  return declaration;
}
