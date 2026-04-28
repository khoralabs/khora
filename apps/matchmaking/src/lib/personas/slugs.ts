import { z } from "zod";

/** Stable URL-safe slugs for simulated directory profiles (no legacy p1/p2/p3). */
export const MATCHMAKING_SIM_PERSONA_SLUGS = [
  "mira-patel",
  "james-ortiz",
  "sara-kim",
  "devon-mack",
  "elena-vasquez",
] as const;

export type MatchmakingSimPersonaSlug = (typeof MATCHMAKING_SIM_PERSONA_SLUGS)[number];

export const zMatchmakingSimPersonaSlug = z.enum(MATCHMAKING_SIM_PERSONA_SLUGS);
