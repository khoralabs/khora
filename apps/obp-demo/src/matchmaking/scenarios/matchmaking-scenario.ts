import type { NegotiationScenario } from "../../negotiation/scenarios/negotiation-scenario.ts";
import type { MeetingSeedPayload } from "../memories/meeting-seed-payload.ts";

/** Same shape as negotiation scenarios; separate name for matchmaking demos. */
export type MatchmakingScenario = NegotiationScenario & {
  /** Same order as `parties`: each entry is that seated persona’s `memorySeeds`. */
  personaSeeds: readonly [MeetingSeedPayload[], MeetingSeedPayload[]];
  /**
   * Same order as `parties`: each string is that seated persona’s `memoryNamespace` (SQLite /
   * hybrid-search namespace), not a separate naming scheme.
   */
  partyMemoryNamespaces: readonly [string, string];
  /** When set, injected as Party A–authored thread text before round 0 (shared thread for both agents). */
  partyAInvitationMessage?: string;
};
