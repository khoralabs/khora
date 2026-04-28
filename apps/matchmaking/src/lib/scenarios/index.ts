import { MATCHMAKING_SIM_PERSONA_SLUGS } from "../personas/slugs.ts";
import { buildIntroRequestScenarioPair } from "./intro-request.ts";
import type { MatchmakingPersonaSlug } from "../personas/index.ts";
import type { MatchmakingScenario } from "./matchmaking-scenario.ts";

export type { MatchmakingPersona, MatchmakingPersonaSlug } from "../personas/index.ts";
export {
  getMatchmakingPersona,
  matchmakingPersonas,
  pairMatchmakingPersonas,
} from "../personas/index.ts";
export {
  buildAppUserIntroRequestScenario,
  buildIntroRequestScenarioPair,
} from "./intro-request.ts";
export type { MatchmakingScenario, NegotiationScenario } from "./matchmaking-scenario.ts";

function buildMatchmakingScenarioIds(): string[] {
  const slugs = [...MATCHMAKING_SIM_PERSONA_SLUGS];
  const ids: string[] = [];
  for (let i = 0; i < slugs.length; i++) {
    for (let j = i + 1; j < slugs.length; j++) {
      const a = slugs[i];
      const b = slugs[j];
      if (a !== undefined && b !== undefined) {
        ids.push(`${a}__${b}`);
      }
    }
  }
  return ids;
}

const _matchmakingScenarioIds = buildMatchmakingScenarioIds();
if (_matchmakingScenarioIds.length === 0) {
  throw new Error("MATCHMAKING_SCENARIO_IDS: need at least two personas to form a pair");
}

export const MATCHMAKING_SCENARIO_IDS = _matchmakingScenarioIds as unknown as readonly [
  string,
  ...string[],
];
export type MatchmakingScenarioId = (typeof MATCHMAKING_SCENARIO_IDS)[number];

export type GetMatchmakingScenarioOptions = {
  /** First thread line from Party A (first seat); Party B sees it before their first turn. */
  invitationMessage?: string;
};

const scenarioBuilders: Record<
  string,
  (opts?: GetMatchmakingScenarioOptions) => Promise<MatchmakingScenario>
> = {};
for (const id of MATCHMAKING_SCENARIO_IDS) {
  const parts = id.split("__");
  if (parts.length !== 2 || parts[0] === "" || parts[1] === "") {
    throw new Error(`Invalid matchmaking scenario id "${id}"`);
  }
  const [requesterSlug, requesteeSlug] = parts as [MatchmakingPersonaSlug, MatchmakingPersonaSlug];
  scenarioBuilders[id] = async (opts) =>
    buildIntroRequestScenarioPair(requesterSlug, requesteeSlug, opts);
}

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
  const run = scenarioBuilders[id];
  if (run === undefined) {
    throw new Error(`No builder for matchmaking scenario "${id}"`);
  }
  return run(options);
}
