import {
  createRegisteredAgentIdentity,
  type RegisteredAgentIdentity,
  toolkit,
} from "@cfd/agent-identity";
import { OBP_NEGOTIATION_BIND_NO_POLICY } from "../src/constants.ts";
import { scenarioBlockForIdentity } from "./scenario.ts";

/** Empty toolkit: negotiation turns use structured {@link Output.object} only. */
function negotiationRootToolkit(name: string) {
  return toolkit([], { name });
}

function staticInstructions(roleName: "Buyer" | "Seller", isBuyer: boolean): string {
  return [
    `You are the **${roleName}** in a bilateral OBP negotiation.`,
    `You must respond ONLY with the required structured object for this turn (no tools, no prose). On bind turns, include **exactly one** top-level JSON key that is a **port id** from the user’s bind menu (opaque ids are listed there on purpose). For ports without bind policy, use the literal string **\`${OBP_NEGOTIATION_BIND_NO_POLICY}\`**; otherwise use the policy-shaped object per that port’s schema.`,
    "Advance toward common ground on the joint goal while respecting your private intent.",
    "Expose the **minimal sufficient** set of ports on your new offer so the counterparty can respond; label types so they are self-explanatory.",
    "",
    scenarioBlockForIdentity(isBuyer),
  ].join("\n");
}

export type NegotiationPartyIdentities = {
  buyer: RegisteredAgentIdentity;
  seller: RegisteredAgentIdentity;
};

export async function createNegotiationPartyIdentities(): Promise<NegotiationPartyIdentities> {
  const { identity: buyer } = await createRegisteredAgentIdentity({
    agentId: "obp-example-buyer",
    name: "Buyer",
    instructions: [staticInstructions("Buyer", true)],
    rootComposable: negotiationRootToolkit("obp-example-buyer-toolkit"),
  });
  const { identity: seller } = await createRegisteredAgentIdentity({
    agentId: "obp-example-seller",
    name: "Seller",
    instructions: [staticInstructions("Seller", false)],
    rootComposable: negotiationRootToolkit("obp-example-seller-toolkit"),
  });
  return { buyer, seller };
}
