import { defineObpNegotiatorIdentity } from "@cfd/obp-negotiator";
import type { NegotiationScenario } from "./negotiation-scenario.ts";

export async function buildFinancingNegotiationScenario(): Promise<NegotiationScenario> {
  const { identity: seller } = await defineObpNegotiatorIdentity("demo-seller", {
    name: "SellerAgent",
    instructions: [
      `You are the provider (seller). Your private persona:
You care about return, risk, and how fast capital comes back—express what you need through offers and ports on the graph.`,
    ],
  });

  const { identity: buyer } = await defineObpNegotiatorIdentity("demo-buyer", {
    name: "BuyerAgent",
    instructions: [
      `You are the customer (buyer). Your private persona:
You care about affordability, total cost, and flexibility—judge any terminal package against your own priorities; nothing enforces numeric limits except your choices.`,
    ],
  });

  return {
    title: "Unconstrained financing discussion",
    parties: [seller, buyer],
    maxRounds: 12,
  };
}
