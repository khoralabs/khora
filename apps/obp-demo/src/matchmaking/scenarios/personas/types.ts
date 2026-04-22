import type { RegisteredAgentIdentity } from "@cfd/agent-identity";
import type { MeetingSeedPayload } from "../../memories/meeting-seed-payload.ts";

/**
 * Stable negotiator identity (name, agent id, instructions) plus memory seeds.
 * Which side speaks first or “initiates” in a run is decided by orchestration (party order), not by this type.
 */
export type MatchmakingPersona = {
  readonly slug: string;
  /** SQLite / hybrid-search namespace for this persona’s seeded memories. */
  readonly memoryNamespace: string;
  readonly memorySeeds: readonly MeetingSeedPayload[];
  buildRegisteredIdentity(): Promise<RegisteredAgentIdentity>;
};
