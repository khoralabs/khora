import type {
  AgentRegistry,
  RegisterAgentOptions,
  RegisteredAgentIdentity,
  SessionContext,
  SessionRunner,
} from "@cfd/agent-identity";
import { evaluateRegisteredAgentAffordances } from "@cfd/agent-identity";
import type { LanguageModel } from "ai";
import { generateGoalExtractorOutput } from "./create-goal-extractor-agent.ts";
import {
  buildGoalExtractorAgentId,
  type DefineGoalExtractorIdentityOptions,
  defineGoalExtractorIdentity,
} from "./identity.ts";
import type { GoalExtractionOutput } from "./output.ts";

export type GoalExtractorSessionContext = SessionContext & {
  model: LanguageModel;
};

export type GoalExtractorSessionInput = {
  message: string;
  maxSteps: number;
};

export type GoalExtractorSessionOutput = {
  generation: unknown;
  output: GoalExtractionOutput;
};

export async function getGoalExtractorAgentDefinition(
  namespace: string,
  options?: DefineGoalExtractorIdentityOptions,
): Promise<{
  staticHash: string;
  identity: RegisteredAgentIdentity;
  registerOptions: RegisterAgentOptions<
    GoalExtractorSessionInput,
    GoalExtractorSessionOutput,
    GoalExtractorSessionContext
  >;
}> {
  const { staticHash, identity } = await defineGoalExtractorIdentity(namespace, options);
  return {
    staticHash,
    identity,
    registerOptions: {
      run: createGoalExtractorSessionRunner(),
    },
  };
}

export async function ensureGoalExtractorAgentRegistered(
  registry: AgentRegistry,
  namespace: string,
  options?: DefineGoalExtractorIdentityOptions,
): Promise<{ staticHash: string; identity: RegisteredAgentIdentity }> {
  const id = buildGoalExtractorAgentId(namespace);
  if (registry.has(id)) {
    const entry = registry.get(id);
    if (!entry) {
      throw new Error(`registry inconsistency: has(${id}) but get is undefined`);
    }
    return { staticHash: entry.agent.staticHash, identity: entry.agent };
  }
  const { staticHash, identity, registerOptions } = await getGoalExtractorAgentDefinition(
    namespace,
    options,
  );
  registry.register(identity, registerOptions);
  return { staticHash, identity };
}

export function createGoalExtractorSessionRunner(): SessionRunner<
  GoalExtractorSessionInput,
  GoalExtractorSessionOutput,
  GoalExtractorSessionContext
> {
  return async ({ agent, input, context }) => {
    const affordances = await evaluateRegisteredAgentAffordances(agent, {
      env: {},
      agentId: agent.agentId,
      agentName: agent.name,
    });
    return generateGoalExtractorOutput({
      model: context.model,
      identity: agent,
      instructions: affordances.instructions,
      maxSteps: input.maxSteps,
      message: input.message,
    });
  };
}
