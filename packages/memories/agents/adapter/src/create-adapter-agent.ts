import type {
  RegisteredAgentAffordances,
  RegisteredAgentIdentity,
  ToolRuntimeContext,
} from "@cfd/agent-identity";
import type { LabelSchemaMap, OntologyDefinition } from "@cfd/memories-core";
import {
  createMemorySearchToolLoopAgent,
  type MemorySearchEnv,
  type MemorySearchToolSet,
} from "@cfd/memories-tools";
import type { LanguageModel, ToolLoopAgent } from "ai";
import {
  type MemoryAdapterStructuredOutput,
  memoryAdapterExpandedOutput,
} from "./adapter-output.js";

/** AI SDK tool map for the memory adapter (search only). */
export type MemoryAdapterToolSet = MemorySearchToolSet;

export type MemoryAdapterAgent = ToolLoopAgent<
  never,
  MemoryAdapterToolSet,
  MemoryAdapterStructuredOutput
>;

export type AdapterPipelineGeneration = Awaited<ReturnType<MemoryAdapterAgent["generate"]>>;

export function createMemoryAdapterAgent<
  TNode extends LabelSchemaMap,
  TEdge extends LabelSchemaMap,
>(args: {
  model: LanguageModel;
  identity: RegisteredAgentIdentity;
  affordances: RegisteredAgentAffordances;
  runtime: ToolRuntimeContext<MemorySearchEnv>;
  ontology: OntologyDefinition<TNode, TEdge>;
  maxSteps?: number;
}): MemoryAdapterAgent {
  const { model, identity, affordances, runtime, ontology, maxSteps = 12 } = args;
  const output = memoryAdapterExpandedOutput(ontology);
  return createMemorySearchToolLoopAgent<MemoryAdapterStructuredOutput>({
    model,
    identity,
    affordances,
    runtime,
    maxSteps,
    output,
  });
}
