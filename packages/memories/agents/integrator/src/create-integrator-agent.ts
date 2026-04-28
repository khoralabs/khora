import type {
  RegisteredAgentAffordances,
  RegisteredAgentIdentity,
  ToolRuntimeContext,
} from "@cfd/agent-identity";
import type { LabelSchemaMap, OntologyDefinition } from "@cfd/memories-core";
import {
  createMemorySearchToolLoopAgent,
  DEFAULT_MEMORY_TOOL_LOOP_MAX_STEPS,
  type MemorySearchEnv,
  type MemorySearchToolSet,
} from "@cfd/memories-tools";
import type { LanguageModel, ToolLoopAgent } from "ai";
import {
  type IntegratorPlanStructuredOutput,
  integratorPlanOutputFromOntology,
} from "./integrator-output.js";

export type MemoryIntegratorToolSet = MemorySearchToolSet;

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
  /** Runtime/system instruction block prepended before evaluated identity/toolkit instructions. */
  instructions?: string;
  runtime: ToolRuntimeContext<MemorySearchEnv>;
  maxSteps?: number;
  ontology: OntologyDefinition<TNode, TEdge>;
}): MemoryIntegratorAgent {
  const {
    model,
    identity,
    affordances,
    instructions,
    runtime,
    maxSteps = DEFAULT_MEMORY_TOOL_LOOP_MAX_STEPS,
    ontology,
  } = args;
  const output = integratorPlanOutputFromOntology(ontology);
  const mergedInstructions = [instructions, affordances.instructions].filter(Boolean).join("\n\n");
  return createMemorySearchToolLoopAgent<IntegratorPlanStructuredOutput>({
    model,
    identity,
    affordances: { ...affordances, instructions: mergedInstructions },
    runtime,
    maxSteps,
    output,
  });
}
