import type {
  RegisteredAgentAffordances,
  RegisteredAgentIdentity,
  ToolRuntimeContext,
} from "@cfd/agent-identity";
import type { LabelSchemaMap, OntologyDefinition } from "@cfd/memories";
import { type LanguageModel, type OnFinishEvent, stepCountIs, type Tool, ToolLoopAgent } from "ai";
import { toolMapToAiTools } from "../adapters/tool-spec-to-ai-sdk";
import { logger } from "../telemetry/logger.js";
import { librarianLog } from "../telemetry/payloads.js";
import { elapsedMs } from "../timing.js";
import {
  type LibrarianMergePlanStructuredOutput,
  librarianMergePlanOutputFromOntology,
} from "../workflow/plan";
import type { MemoryLibrarianEnv } from "./toolkit";

/** AI SDK tool map produced for the memory librarian (matches {@link toolMapToAiTools}). */
export type MemoryLibrarianToolSet = Record<string, Tool<unknown, unknown>>;

export type MemoryLibrarianToolLoopAgent = ToolLoopAgent<
  never,
  MemoryLibrarianToolSet,
  LibrarianMergePlanStructuredOutput
>;

/** Result of {@link MemoryLibrarianToolLoopAgent.generate} — aligned with the constructed agent. */
export type LibrarianPipelineGeneration = Awaited<
  ReturnType<MemoryLibrarianToolLoopAgent["generate"]>
>;

export function createMemoryLibrarianToolLoopAgent<
  TNode extends LabelSchemaMap = LabelSchemaMap,
  TEdge extends LabelSchemaMap = LabelSchemaMap,
>(args: {
  model: LanguageModel;
  identity: RegisteredAgentIdentity;
  affordances: RegisteredAgentAffordances;
  runtime: ToolRuntimeContext<MemoryLibrarianEnv>;
  maxSteps?: number;
  ontology: OntologyDefinition<TNode, TEdge>;
}): MemoryLibrarianToolLoopAgent {
  const { model, identity, affordances, runtime, maxSteps = 12, ontology } = args;
  const tools: MemoryLibrarianToolSet = toolMapToAiTools(affordances.tools, runtime);
  const inst = affordances.instructions.trim();
  const mergePlanOutput = librarianMergePlanOutputFromOntology(ontology);

  /** Wall-clock span for each completed step (LLM + tool execution for that step). */
  let stepWallStart = performance.now();

  return new ToolLoopAgent<never, MemoryLibrarianToolSet, LibrarianMergePlanStructuredOutput>({
    id: identity.agentId,
    model,
    tools,
    ...(inst ? { instructions: inst } : {}),
    stopWhen: stepCountIs(maxSteps),
    output: mergePlanOutput,
    prepareStep: ({ steps, stepNumber }) => {
      if (steps.length === 0 && stepNumber === 0) {
        stepWallStart = performance.now();
      }
      return undefined;
    },
    onStepFinish: (step) => {
      const processTimeMs = elapsedMs(stepWallStart);
      stepWallStart = performance.now();
      const toolNames = step.toolCalls.map((c) => c.toolName);
      logger.info(
        librarianLog("librarian.toolLoop.step", {
          processTimeMs,
          stepNumber: step.stepNumber,
          finishReason: step.finishReason,
          toolCallCount: step.toolCalls.length,
          toolNames,
          usage: step.usage,
          textLength: step.text.length,
        }),
      );
    },
    onFinish: (event: OnFinishEvent<MemoryLibrarianToolSet>) => {
      const t0 = performance.now();
      logger.info(
        librarianLog("librarian.toolLoop.finish", {
          processTimeMs: elapsedMs(t0),
          stepCount: event.steps.length,
          totalUsage: event.totalUsage,
          finishReason: event.finishReason,
        }),
      );
    },
  });
}
