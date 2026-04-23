/**
 * Programmatic surface for the matchmaking Bun server and scripts (not bundled for the browser).
 */

export { type CompletedDeal, resolveCompletedDeal } from "@cfd/obp-core";
export {
  type NegotiationEndPayload,
  negotiationEndPayloadFromGeneration,
} from "@cfd/obp-negotiator";
/** OBP stack + Gemini + transcript helpers used by {@link runMatchmakingSession}. */
export { agentSourcemaps } from "@cfd/obp-tools";
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
export type { CreateDemoStackOptions, DemoStack } from "./matchmaking-obp/index.ts";
export {
  appendTextTranscriptInvitation,
  appendTextTranscriptTurn,
  createDemoStack,
  createLoggingObpPersistence,
  DEMO_CLOCK_MS,
  ensureObpRunDir,
  getNegotiationModel,
  initTextTranscript,
  isObpMemoryMode,
  obpStepLogFromEnv,
  resolveGeminiApiKey,
  resolveObpDatabasePath,
  resolveObpDir,
  resolveObpSqliteFilename,
  resolveObpStepsJsonlPath,
  textTranscriptPathFromJsonl,
} from "./matchmaking-obp/index.ts";
export type {
  MatchmakingMemoriesBundle,
  MatchmakingMemoriesBundleOptions,
} from "./memories/create-memories-bundle.ts";
export { createMatchmakingMemoriesBundle } from "./memories/create-memories-bundle.ts";
export {
  jsonlStorePathForNamespace,
  resolveMemoriesDbPath,
  resolveMemoriesRoot,
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
