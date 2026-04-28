import {
  createRegisteredAgentIdentity,
  type RegisteredAgentIdentity,
  toolkit,
} from "@cfd/agent-identity";
import { memorySearchToolkit } from "@cfd/memories-tools";

export const NEGOTIATION_SUMMARY_AGENT_ID = "matchmaking-negotiation-summary";

export function buildNegotiationSummaryAgentId(namespace: string): string {
  const safe = namespace.replace(/[^a-zA-Z0-9._-]+/g, "-");
  return `${NEGOTIATION_SUMMARY_AGENT_ID}-${safe}`;
}

const negotiationSummaryBaseInstruction = `Create a personal, contextual summary of a completed matchmaking negotiation.

Rules:
- Ground claims in memory_search hits from your bound namespace and in the provided negotiation transcript.
- Do not speculate about hidden intent; if evidence is weak, say so briefly.
- Keep summary concise, practical, and first-person useful for this party.
- Include a clear recommendation for next step.
- Never attempt to choose or override namespace; tools are already scoped.`;

const negotiationSummaryToolkit = toolkit([memorySearchToolkit], {
  name: "matchmaking-negotiation-summary-toolkit",
});

export type DefineNegotiationSummaryIdentityOptions = {
  identityContext?: Record<string, unknown>;
  instructions?: string[];
};

export async function defineNegotiationSummaryIdentity(
  namespace: string,
  options?: DefineNegotiationSummaryIdentityOptions,
): Promise<{ staticHash: string; identity: RegisteredAgentIdentity }> {
  return createRegisteredAgentIdentity({
    agentId: buildNegotiationSummaryAgentId(namespace),
    name: "Matchmaking Negotiation Summarizer",
    instructions: [...(options?.instructions ?? []), negotiationSummaryBaseInstruction],
    context: {
      role: "negotiation-summary",
      targetNamespace: namespace,
      ...(options?.identityContext ?? {}),
    },
    rootComposable: negotiationSummaryToolkit,
  });
}
