import type { RegisteredAgentIdentity } from "@cfd/agent-identity";
import {
  collectToolStaticHashes,
  createRegisteredAgentIdentity,
  evaluateComposable,
  tool,
  toolkit,
} from "@cfd/agent-identity";
import { emptyObjectSchema } from "../schema.ts";

export type DemoAgents = {
  buyer: RegisteredAgentIdentity;
  seller: RegisteredAgentIdentity;
};

const propose = tool({
  name: "propose",
  description: "Propose negotiation terms",
  inputSchema: emptyObjectSchema(),
  handler: async () => ({ ok: true as const }),
});

const accept = tool({
  name: "accept",
  description: "Accept counterparty terms",
  inputSchema: emptyObjectSchema(),
  handler: async () => ({ ok: true as const }),
});

const publish = tool({
  name: "publish",
  description: "Publish an offer surface",
  inputSchema: emptyObjectSchema(),
  handler: async () => ({ ok: true as const }),
});

const probe = tool({
  name: "probe",
  description: "Probe counterparty constraints",
  inputSchema: emptyObjectSchema(),
  handler: async () => ({ ok: true as const }),
});

const buyerRoot = toolkit([propose, accept], {
  name: "buyer-negotiation",
  instructions: ["Collaborative buyer toolkit."],
});

const sellerRoot = toolkit([publish, probe], {
  name: "seller-negotiation",
  instructions: ["Seller / adversarial surface toolkit."],
});

export async function buildAgents(): Promise<DemoAgents> {
  const { identity: buyer } = await createRegisteredAgentIdentity({
    agentId: "demo-negotiation-buyer",
    name: "BuyerAgent",
    instructions: ["Prefer binding when terms are acceptable."],
    rootComposable: buyerRoot,
  });

  const { identity: seller } = await createRegisteredAgentIdentity({
    agentId: "demo-negotiation-seller",
    name: "SellerAgent",
    instructions: ["Control exposure and capacity on ports."],
    rootComposable: sellerRoot,
  });

  return { buyer, seller };
}

/** Runtime hashes + enabled tools for transcript attribution (optional). */
export async function evaluateAgentToolkit(agent: RegisteredAgentIdentity) {
  const evaluated = await evaluateComposable(agent.rootComposable, {
    env: {},
    agentId: agent.agentId,
    agentName: agent.name,
  });
  const nameToStaticHash = await collectToolStaticHashes(agent.rootComposable);
  return { evaluated, nameToStaticHash };
}
