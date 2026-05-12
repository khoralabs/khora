import { createAgentRegistry, type RegisteredAgentIdentity } from "@khoralabs/agent-identity";
import {
  ensureObpNegotiatorStructuredAgentRegistered,
  type ObpNegotiatorStructuredSessionContext,
} from "@khoralabs/obp-negotiator";

export type NegotiationPartyIdentities = {
  registry: ReturnType<typeof createAgentRegistry>;
  buyer: RegisteredAgentIdentity;
  seller: RegisteredAgentIdentity;
};

export type NegotiationScenarioIdentityOptions = {
  scenarioBlockForIdentity: (isBuyer: boolean) => string;
  partyDisplayNames: { buyer: string; seller: string };
};

/**
 * Builds a fresh registry with the buyer + seller negotiator identities. Each
 * party gets the OBP negotiator base instructions plus its private scenario
 * block as additional instructions.
 */
export async function createNegotiationPartyIdentities(
  opts: NegotiationScenarioIdentityOptions,
): Promise<NegotiationPartyIdentities> {
  const registry = createAgentRegistry();

  const { identity: buyer } = await ensureObpNegotiatorStructuredAgentRegistered(
    registry,
    "demo-buyer",
    {
      name: opts.partyDisplayNames.buyer,
      instructions: [opts.scenarioBlockForIdentity(true)],
    },
  );
  const { identity: seller } = await ensureObpNegotiatorStructuredAgentRegistered(
    registry,
    "demo-seller",
    {
      name: opts.partyDisplayNames.seller,
      instructions: [opts.scenarioBlockForIdentity(false)],
    },
  );

  return { registry, buyer, seller };
}

export type { ObpNegotiatorStructuredSessionContext };
