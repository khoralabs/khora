import { type AgentRegistry, createAgentRegistry } from "@cfd/agent-identity";
import type { LanguageModel } from "ai";
import type { DefineGoalExtractorIdentityOptions } from "./identity.ts";
import type { GoalExtractionOutput } from "./output.ts";
import {
  ensureGoalExtractorAgentRegistered,
  type GoalExtractorSessionInput,
  type GoalExtractorSessionOutput,
} from "./session.ts";

export type GoalExtractorClientOptions = DefineGoalExtractorIdentityOptions & {
  registry?: AgentRegistry;
  namespace: string;
  model: LanguageModel;
  defaultMaxSteps?: number;
};

export class GoalExtractorClient {
  readonly registry: AgentRegistry;
  readonly namespace: string;
  readonly model: LanguageModel;
  readonly identityContext: Record<string, unknown> | undefined;
  readonly instructions: string[] | undefined;
  readonly defaultMaxSteps: number;

  constructor(options: GoalExtractorClientOptions) {
    this.registry = options.registry ?? createAgentRegistry();
    this.namespace = options.namespace;
    this.model = options.model;
    this.identityContext = options.identityContext;
    this.instructions = options.instructions;
    this.defaultMaxSteps = options.defaultMaxSteps ?? 2;
  }

  async extractGoals(args: { message: string; maxSteps?: number }): Promise<GoalExtractionOutput> {
    const { identity } = await ensureGoalExtractorAgentRegistered(this.registry, this.namespace, {
      ...(this.identityContext !== undefined ? { identityContext: this.identityContext } : {}),
      ...(this.instructions !== undefined ? { instructions: this.instructions } : {}),
    });
    const session = this.registry.createSession(identity.agentId, {
      ctx: {
        model: this.model,
      },
    });
    const out = await session.start<GoalExtractorSessionInput, GoalExtractorSessionOutput>({
      message: args.message,
      maxSteps: args.maxSteps ?? this.defaultMaxSteps,
    });
    return out.output;
  }
}
