import { createRegisteredAgent, type RegisteredAgent } from "@khoralabs/agent-capabilities";

import {
  buildInterviewSessionInstruction,
  type InterviewSessionMeta,
  interviewBaseInstruction,
} from "./instructions.js";
import { interviewToolkit } from "./toolkit.js";

export const EXEDRA_INTERVIEW_AGENT_ID = "exedra-interview";

export function buildInterviewAgentId(sessionId: string): string {
  return `${EXEDRA_INTERVIEW_AGENT_ID}-${sessionId}`;
}

export type DefineInterviewIdentityOptions = {
  identityContext?: Record<string, unknown>;
};

export async function defineInterviewAgentIdentity(
  sessionId: string,
  meta: InterviewSessionMeta,
  options?: DefineInterviewIdentityOptions,
): Promise<{ staticHash: string; identity: RegisteredAgent }> {
  const { staticHash, agent } = await createRegisteredAgent({
    agentId: buildInterviewAgentId(sessionId),
    name: "Interview Agent",
    instructions: [interviewBaseInstruction, buildInterviewSessionInstruction(meta)],
    context: {
      role: "exedra-interview",
      sessionId,
      ...(options?.identityContext ?? {}),
    },
    rootComposable: interviewToolkit,
  });
  return { staticHash, identity: agent };
}
