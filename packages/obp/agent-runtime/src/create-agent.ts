import type {
  RegisteredAgentAffordances,
  RegisteredAgentIdentity,
  ToolRuntimeContext,
} from "@cfd/agent-identity";
import { toolMapToAiTools } from "@cfd/agent-identity-adapters";
import { type LanguageModel, stepCountIs, type Tool, ToolLoopAgent, type ToolSet } from "ai";

type ToolLoopOutputSpec = NonNullable<ConstructorParameters<typeof ToolLoopAgent>[0]["output"]>;

export type StructuredObpNegotiationToolSet = Record<string, Tool<unknown, unknown>> & ToolSet;

const DEFAULT_MAX_STEPS = 4;

/**
 * {@link ToolLoopAgent} with structured negotiation output only (default toolkit has no OBP graph tools).
 * Build `output` from `Output.object({ schema })` using the Zod schema returned by {@link NegotiationRuntime.prepareActingTurn} (bind choice by index, not port id).
 */
export function createStructuredObpNegotiationAgent<
  Env extends Record<string, unknown> = Record<string, never>,
  OUTPUT extends ToolLoopOutputSpec = ToolLoopOutputSpec,
>(args: {
  model: LanguageModel;
  identity: RegisteredAgentIdentity;
  affordances: RegisteredAgentAffordances;
  runtime: ToolRuntimeContext<Env>;
  output: OUTPUT;
  maxSteps?: number;
}): ToolLoopAgent<never, StructuredObpNegotiationToolSet, OUTPUT> {
  const tools = toolMapToAiTools(
    args.affordances.tools,
    args.runtime,
  ) as StructuredObpNegotiationToolSet;
  const maxSteps = args.maxSteps ?? DEFAULT_MAX_STEPS;
  const inst = args.affordances.instructions.trim();
  return new ToolLoopAgent<never, StructuredObpNegotiationToolSet, OUTPUT>({
    id: args.identity.agentId,
    model: args.model,
    tools,
    ...(inst ? { instructions: inst } : {}),
    stopWhen: stepCountIs(maxSteps),
    output: args.output,
  });
}
