import type {
  RegisteredAgentAffordances,
  RegisteredAgentIdentity,
  ToolRuntimeContext,
} from "@cfd/agent-identity";
import { type LanguageModel, stepCountIs, type Tool, ToolLoopAgent } from "ai";
import { toolMapToAiTools } from "../adapters/tool-spec-to-ai-sdk";
import {
  type LibrarianMergePlanStructuredOutput,
  librarianMergePlanOutput,
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

export function createMemoryLibrarianToolLoopAgent(args: {
  model: LanguageModel;
  identity: RegisteredAgentIdentity;
  affordances: RegisteredAgentAffordances;
  runtime: ToolRuntimeContext<MemoryLibrarianEnv>;
  maxSteps?: number;
}): MemoryLibrarianToolLoopAgent {
  const { model, identity, affordances, runtime, maxSteps = 12 } = args;
  const tools: MemoryLibrarianToolSet = toolMapToAiTools(affordances.tools, runtime);
  const inst = affordances.instructions.trim();
  return new ToolLoopAgent<never, MemoryLibrarianToolSet, LibrarianMergePlanStructuredOutput>({
    id: identity.agentId,
    model,
    tools,
    ...(inst ? { instructions: inst } : {}),
    stopWhen: stepCountIs(maxSteps),
    output: librarianMergePlanOutput,
  });
}
