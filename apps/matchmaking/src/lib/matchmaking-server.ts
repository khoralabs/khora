/**
 * Programmatic surface for the matchmaking Bun server and scripts (not bundled for the browser).
 */

/** OBP stack + Gemini + transcript helpers used by {@link runMatchmakingSession}. */
export * from "./matchmaking-obp/index.ts";

export { inviteRequestSchema } from "./invite-request.ts";
export type {
  MatchmakingResult,
  MatchmakingSessionContext,
  MatchmakingTurnInput,
} from "./llm/session.ts";
export {
  assertMatchmakingBindAllowed,
  resolveMatchmakingConnectedDeal,
  runMatchmakingSession,
} from "./llm/session.ts";
export type { MatchmakingMemoriesBundle } from "./memories/create-memories-bundle.ts";
export { createMatchmakingMemoriesBundle } from "./memories/create-memories-bundle.ts";
export {
  jsonlStorePathForNamespace,
  resolveObpDemoMemoriesDbPath,
  resolveObpDemoMemoriesRoot,
} from "./memories/persisted-memories.ts";
export {
  seedAllMatchmakingPersonaMemories,
  seedMatchmakingPersonas,
  seedPersonaMemoryNamespace,
} from "./memories/seed-personas.ts";
export { listPersonaPublicDtos, type PersonaPublicDto } from "./persona-public-dtos.ts";
export type {
  GetMatchmakingScenarioOptions,
  MatchmakingPersona,
  MatchmakingPersonaSlug,
  MatchmakingScenarioId,
} from "./scenarios/index.ts";
export {
  getMatchmakingPersona,
  getMatchmakingScenario,
  MATCHMAKING_SCENARIO_IDS,
  matchmakingPersonas,
  pairMatchmakingPersonas,
} from "./scenarios/index.ts";
export { buildIntroRequestScenarioPair } from "./scenarios/intro-request.ts";
export type { MatchmakingScenario } from "./scenarios/matchmaking-scenario.ts";
