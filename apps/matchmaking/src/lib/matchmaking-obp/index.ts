/**
 * Matchmaking-only helpers: Gemini negotiation model, plaintext transcript, OBP demo stack.
 * OBP protocol helpers live in `@khoralabs/obp-core`, `@khoralabs/obp-negotiator`, and `@khoralabs/obp-tools`.
 */
/** @deprecated Renamed {@link DEMO_LEDGER_SEQ}; kept for older imports. */
export {
  type CreateDemoStackOptions,
  createDemoStack,
  DEMO_LEDGER_SEQ,
  DEMO_LEDGER_SEQ as DEMO_CLOCK_MS,
  type DemoStack,
} from "./demo-stack.ts";
export { getNegotiationModel, resolveGeminiApiKey } from "./gemini-model.ts";
export { createLoggingObpPersistence } from "./obp-persistence-jsonl-log.ts";
export {
  ensureObpRunDir,
  isObpMemoryMode,
  obpStepLogFromEnv,
  resolveObpDatabasePath,
  resolveObpDir,
  resolveObpSqliteFilename,
  resolveObpStepsJsonlPath,
} from "./persisted-obp.ts";
export {
  appendTextTranscriptInvitation,
  appendTextTranscriptTurn,
  initTextTranscript,
  textTranscriptPathFromJsonl,
} from "./text-transcript.ts";
