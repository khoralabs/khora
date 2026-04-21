import { buildIntroRequestScenario } from "./intro-request.ts";
import type { MatchmakingScenario } from "./matchmaking-scenario.ts";

export type { MatchmakingScenario } from "./matchmaking-scenario.ts";
export { buildIntroRequestScenario } from "./intro-request.ts";

export const MATCHMAKING_SCENARIO_IDS = ["intro-request"] as const;
export type MatchmakingScenarioId = (typeof MATCHMAKING_SCENARIO_IDS)[number];

const builders: Record<MatchmakingScenarioId, () => Promise<MatchmakingScenario>> = {
  "intro-request": buildIntroRequestScenario,
};

function isMatchmakingScenarioId(id: string): id is MatchmakingScenarioId {
  return (MATCHMAKING_SCENARIO_IDS as readonly string[]).includes(id);
}

export async function getMatchmakingScenario(id: string): Promise<MatchmakingScenario> {
  if (!isMatchmakingScenarioId(id)) {
    throw new Error(
      `Unknown matchmaking scenario "${id}". Valid: ${MATCHMAKING_SCENARIO_IDS.join(", ")}`,
    );
  }
  return builders[id]();
}
