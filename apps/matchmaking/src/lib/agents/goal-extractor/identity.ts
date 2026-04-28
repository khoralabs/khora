import {
  createRegisteredAgentIdentity,
  type RegisteredAgentIdentity,
  toolkit,
} from "@cfd/agent-identity";

export const GOAL_EXTRACTOR_AGENT_ID = "matchmaking-goal-extractor";

export function buildGoalExtractorAgentId(namespace: string): string {
  return `${GOAL_EXTRACTOR_AGENT_ID}-${namespace}`;
}

const goalExtractorBaseInstruction = `Extract a concise list of explicit user goals from the invitation message.

Rules:
- Use only what is present in the invitation text.
- Prefer concrete outcomes over vague themes.
- Keep each goal short and standalone.
- Do not include schedule logistics as goals unless clearly framed as an objective.
- Return an empty goals list when no clear goals are present.`;

const goalExtractorToolkit = toolkit([], {
  name: "matchmaking-goal-extractor-toolkit",
});

export type DefineGoalExtractorIdentityOptions = {
  identityContext?: Record<string, unknown>;
  instructions?: string[];
};

export async function defineGoalExtractorIdentity(
  namespace: string,
  options?: DefineGoalExtractorIdentityOptions,
): Promise<{ staticHash: string; identity: RegisteredAgentIdentity }> {
  return createRegisteredAgentIdentity({
    agentId: buildGoalExtractorAgentId(namespace),
    name: "Matchmaking Goal Extractor",
    instructions: [...(options?.instructions ?? []), goalExtractorBaseInstruction],
    context: {
      role: "goal-extractor",
      targetNamespace: namespace,
      ...(options?.identityContext ?? {}),
    },
    rootComposable: goalExtractorToolkit,
  });
}
