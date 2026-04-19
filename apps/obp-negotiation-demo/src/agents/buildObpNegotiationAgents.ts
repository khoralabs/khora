import { createRegisteredAgentIdentity, type RegisteredAgentIdentity } from "@cfd/agent-identity";
import { obpToolkit } from "@cfd/obp-tools";

export type ObpLlmAgents = {
  buyer: RegisteredAgentIdentity;
  seller: RegisteredAgentIdentity;
};

/** Identities whose root is only {@link obpToolkit} — for LLM + ToolLoopAgent runs. */
export async function buildObpNegotiationAgents(): Promise<ObpLlmAgents> {
  const { identity: buyer } = await createRegisteredAgentIdentity({
    agentId: "demo-negotiation-buyer",
    name: "BuyerAgent",
    instructions: [],
    rootComposable: obpToolkit,
  });

  const { identity: seller } = await createRegisteredAgentIdentity({
    agentId: "demo-negotiation-seller",
    name: "SellerAgent",
    instructions: [],
    rootComposable: obpToolkit,
  });

  return { buyer, seller };
}
