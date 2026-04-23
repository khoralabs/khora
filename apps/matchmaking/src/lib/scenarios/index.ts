import { buildIntroRequestScenarioPair } from "./intro-request.ts";
import type { MatchmakingScenario } from "./matchmaking-scenario.ts";

export type { MatchmakingPersona, MatchmakingPersonaSlug } from "../personas/index.ts";
export {
  getMatchmakingPersona,
  matchmakingPersonas,
  pairMatchmakingPersonas,
} from "../personas/index.ts";
export { buildAppUserIntroRequestScenario, buildIntroRequestScenarioPair } from "./intro-request.ts";
export type { MatchmakingScenario, NegotiationScenario } from "./matchmaking-scenario.ts";

export const MATCHMAKING_SCENARIO_IDS = ["p1_p2", "p1_p3", "p2_p3"] as const;
export type MatchmakingScenarioId = (typeof MATCHMAKING_SCENARIO_IDS)[number];

export type GetMatchmakingScenarioOptions = {
  /** First thread line from Party A (first seat); Party B sees it before their first turn. */
  invitationMessage?: string;
};

const builders: Record<
  MatchmakingScenarioId,
  (opts?: GetMatchmakingScenarioOptions) => Promise<MatchmakingScenario>
> = {
  p1_p2: async (opts) => buildIntroRequestScenarioPair("p1", "p2", opts),
  p1_p3: async (opts) => buildIntroRequestScenarioPair("p1", "p3", opts),
  p2_p3: async (opts) => buildIntroRequestScenarioPair("p2", "p3", opts),
};

function isMatchmakingScenarioId(id: string): id is MatchmakingScenarioId {
  return (MATCHMAKING_SCENARIO_IDS as readonly string[]).includes(id);
}

export async function getMatchmakingScenario(
  id: string,
  options?: GetMatchmakingScenarioOptions,
): Promise<MatchmakingScenario> {
  if (!isMatchmakingScenarioId(id)) {
    throw new Error(
      `Unknown matchmaking scenario "${id}". Valid: ${MATCHMAKING_SCENARIO_IDS.join(", ")}`,
    );
  }
  return builders[id](options);
}
