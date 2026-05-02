import { createAgentRegistry, type RegisteredAgentIdentity } from "@cfd/agent-identity";
import {
  ensureObpNegotiatorStructuredAgentRegistered,
  type ObpNegotiatorStructuredSessionContext,
} from "@cfd/obp-negotiator";
import { scenarioBlockForIdentity } from "./scenario.ts";

export type NegotiationPartyIdentities = {
  registry: ReturnType<typeof createAgentRegistry>;
  buyer: RegisteredAgentIdentity;
  seller: RegisteredAgentIdentity;
};

/**
 * Builds a fresh registry with the buyer + seller negotiator identities. Each
 * party gets the OBP negotiator base instructions plus its private scenario
 * block as additional instructions.
 *
 * The agent identity itself lives in `@cfd/obp-negotiator`; the example only
 * supplies role text and registers the structured-output session runner.
 */
export async function createNegotiationPartyIdentities(): Promise<NegotiationPartyIdentities> {
  const registry = createAgentRegistry();

  const { identity: buyer } = await ensureObpNegotiatorStructuredAgentRegistered(
    registry,
    "demo-buyer",
    {
      name: "Buyer",
      instructions: [scenarioBlockForIdentity(true)],
    },
  );
  const { identity: seller } = await ensureObpNegotiatorStructuredAgentRegistered(
    registry,
    "demo-seller",
    {
      name: "Seller",
      instructions: [scenarioBlockForIdentity(false)],
    },
  );

  return { registry, buyer, seller };
}

export type { ObpNegotiatorStructuredSessionContext };
