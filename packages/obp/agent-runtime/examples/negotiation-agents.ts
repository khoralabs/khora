import {
  createRegisteredAgentIdentity,
  type RegisteredAgentIdentity,
  tool,
} from "@cfd/agent-identity";
import z from "zod";
import { scenarioBlockForIdentity } from "./scenario.ts";

/**
 * Leaf composable so {@link createRegisteredAgentIdentity} has a root toolkit (no OBP graph tools).
 * Structured negotiation uses {@link Output.object} only; this tool is never invoked by the model.
 */
function unusedPlaceholderTool(name: string) {
  return tool({
    name,
    description: "Unused in structured-output-only negotiation.",
    inputSchema: z.object({}).strict(),
    handler: async () => undefined,
  });
}

function staticInstructions(roleName: "Buyer" | "Seller", isBuyer: boolean): string {
  return [
    `You are the **${roleName}** in a bilateral OBP negotiation.`,
    "You must respond ONLY with the required structured object for this turn (no tools, no prose). On bind turns, choose the counterparty affordance by **`bindChoiceIndex`** (integer index from the numbered list in the user message)—never invent port ids.",
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
    rootComposable: unusedPlaceholderTool("buyer_placeholder"),
  });
  const { identity: seller } = await createRegisteredAgentIdentity({
    agentId: "obp-example-seller",
    name: "Seller",
    instructions: [staticInstructions("Seller", false)],
    rootComposable: unusedPlaceholderTool("seller_placeholder"),
  });
  return { buyer, seller };
}
