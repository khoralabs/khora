import type { RegisteredAgentIdentity } from "@cfd/agent-identity";
import type { MeetingSeedPayload } from "../memories/meeting-seed-payload.ts";

/** Two-party scenario shape shared with generic OBP demos (minimal copy for this app). */
export interface NegotiationScenario {
  title: string;
  /**
   * Ordered participants. Matchmaking assumes index 0 = Party A (requester), index 1 = Party B
   * (requestee); turns rotate A, B, A…
   */
  parties: RegisteredAgentIdentity[];
  maxRounds?: number;
}

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
