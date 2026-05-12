import type { RegisteredAgentIdentity } from "@khoralabs/agent-identity";
import type { MeetingSeedPayload } from "../memories/meeting-seed-payload.ts";

export type MatchmakingPersonaProfile = {
  readonly tagline: string;
  readonly about: string;
};

/**
 * Template negotiator: one OBP+memory root per persona, cross-subject per-user namespaces at runtime
 * (see `memoryNamespace` getter, {@link import("../memories/matchmaking-persona-memory-namespace.ts")}).
 */
export type MatchmakingPersona = {
  readonly slug: string;
  /** Shown in UI and in {@link import("@khoralabs/obp-negotiator").defineObpNegotiatorIdentity} as `name`. */
  readonly displayName: string;
  readonly profile: MatchmakingPersonaProfile;
  /** Seeded memory KG path under the memories root. */
  get memoryNamespace(): string;
  readonly memorySeeds: readonly MeetingSeedPayload[];
  buildRegisteredIdentity(): Promise<RegisteredAgentIdentity>;
};
