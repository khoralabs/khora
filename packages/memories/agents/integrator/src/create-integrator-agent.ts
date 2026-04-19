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
  type IntegratorPlanStructuredOutput,
  integratorPlanOutputFromOntology,
} from "./integrator-output.js";

export type MemoryIntegratorToolSet = Record<string, Tool<unknown, unknown>>;

export type MemoryIntegratorAgent = ToolLoopAgent<
  never,
  MemoryIntegratorToolSet,
  IntegratorPlanStructuredOutput
>;

export type IntegratorPipelineGeneration = Awaited<ReturnType<MemoryIntegratorAgent["generate"]>>;

export function createMemoryIntegratorAgent<
  TNode extends LabelSchemaMap = LabelSchemaMap,
  TEdge extends LabelSchemaMap = LabelSchemaMap,
>(args: {
  model: LanguageModel;
  identity: RegisteredAgentIdentity;
  affordances: RegisteredAgentAffordances;
  runtime: ToolRuntimeContext<MemorySearchEnv>;
  maxSteps?: number;
  ontology: OntologyDefinition<TNode, TEdge>;
}): MemoryIntegratorAgent {
  const { model, identity, affordances, runtime, maxSteps = 12, ontology } = args;
  const tools: MemoryIntegratorToolSet = toolMapToAiTools(affordances.tools, runtime);
  const inst = affordances.instructions.trim();
  const output = integratorPlanOutputFromOntology(ontology);

  return new ToolLoopAgent<never, MemoryIntegratorToolSet, IntegratorPlanStructuredOutput>({
    id: identity.agentId,
    model,
    tools,
    ...(inst ? { instructions: inst } : {}),
    stopWhen: stepCountIs(maxSteps),
    output,
  });
}
