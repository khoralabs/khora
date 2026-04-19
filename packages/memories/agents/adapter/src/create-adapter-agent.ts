import type {
  RegisteredAgentAffordances,
  RegisteredAgentIdentity,
  ToolRuntimeContext,
} from "@cfd/agent-identity";
import { toolMapToAiTools } from "@cfd/agent-identity-adapters";
import type { LabelSchemaMap, OntologyDefinition } from "@cfd/memories-core";
import type { MemorySearchEnv } from "@cfd/memories-tools";
import { type LanguageModel, stepCountIs, type Tool, ToolLoopAgent } from "ai";
import {
  type MemoryAdapterStructuredOutput,
  memoryAdapterExpandedOutput,
} from "./adapter-output.js";

/** AI SDK tool map for the memory adapter (search only). */
export type MemoryAdapterToolSet = Record<string, Tool<unknown, unknown>>;

export type MemoryAdapterToolLoopAgent = ToolLoopAgent<
  never,
  MemoryAdapterToolSet,
  MemoryAdapterStructuredOutput
>;

export type AdapterPipelineGeneration = Awaited<ReturnType<MemoryAdapterToolLoopAgent["generate"]>>;

export function createMemoryAdapterToolLoopAgent<
  TNode extends LabelSchemaMap,
  TEdge extends LabelSchemaMap,
>(args: {
  model: LanguageModel;
  identity: RegisteredAgentIdentity;
  affordances: RegisteredAgentAffordances;
  runtime: ToolRuntimeContext<MemorySearchEnv>;
  ontology: OntologyDefinition<TNode, TEdge>;
  maxSteps?: number;
}): MemoryAdapterToolLoopAgent {
  const { model, identity, affordances, runtime, ontology, maxSteps = 12 } = args;
  const tools: MemoryAdapterToolSet = toolMapToAiTools(affordances.tools, runtime);
  const inst = affordances.instructions.trim();
  const output = memoryAdapterExpandedOutput(ontology);

  return new ToolLoopAgent<never, MemoryAdapterToolSet, MemoryAdapterStructuredOutput>({
    id: identity.agentId,
    model,
    tools,
    ...(inst ? { instructions: inst } : {}),
    stopWhen: stepCountIs(maxSteps),
    output,
  });
}
