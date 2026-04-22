import { buildFinancingNegotiationScenario } from "./financing.ts";
import { buildMeetingNegotiationScenario } from "./meeting.ts";
import type { NegotiationScenario } from "./negotiation-scenario.ts";

export { buildFinancingNegotiationScenario } from "./financing.ts";
export { buildMeetingNegotiationScenario } from "./meeting.ts";
export type { NegotiationScenario } from "./negotiation-scenario.ts";

export const NEGOTIATION_SCENARIO_IDS = ["financing", "meeting"] as const;
export type NegotiationScenarioId = (typeof NEGOTIATION_SCENARIO_IDS)[number];

const builders: Record<NegotiationScenarioId, () => Promise<NegotiationScenario>> = {
  financing: buildFinancingNegotiationScenario,
  meeting: buildMeetingNegotiationScenario,
};

function isNegotiationScenarioId(id: string): id is NegotiationScenarioId {
  return (NEGOTIATION_SCENARIO_IDS as readonly string[]).includes(id);
}

export async function getNegotiationScenario(id: string): Promise<NegotiationScenario> {
  if (!isNegotiationScenarioId(id)) {
    throw new Error(
      `Unknown negotiation scenario "${id}". Valid: ${NEGOTIATION_SCENARIO_IDS.join(", ")}`,
    );
  }
  return builders[id]();
}

/** @deprecated Prefer {@link buildFinancingNegotiationScenario} or {@link getNegotiationScenario}. */
export async function buildDefaultNegotiationScenario(): Promise<NegotiationScenario> {
  return buildFinancingNegotiationScenario();
}
