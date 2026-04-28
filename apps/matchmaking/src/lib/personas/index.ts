import type { MatchmakingSimPersonaSlug } from "./slugs.ts";
import { matchmakingPersonaDevonMack } from "./devon-mack.ts";
import { matchmakingPersonaElenaVasquez } from "./elena-vasquez.ts";
import { matchmakingPersonaJamesOrtiz } from "./james-ortiz.ts";
import { matchmakingPersonaMiraPatel } from "./mira-patel.ts";
import { matchmakingPersonaSaraKim } from "./sara-kim.ts";
import type { MatchmakingPersona } from "./types.ts";

export type { MatchmakingPersona } from "./types.ts";
export type { MatchmakingSimPersonaSlug } from "./slugs.ts";
export { MATCHMAKING_SIM_PERSONA_SLUGS, zMatchmakingSimPersonaSlug } from "./slugs.ts";

export const matchmakingPersonas = {
  "mira-patel": matchmakingPersonaMiraPatel,
  "james-ortiz": matchmakingPersonaJamesOrtiz,
  "sara-kim": matchmakingPersonaSaraKim,
  "devon-mack": matchmakingPersonaDevonMack,
  "elena-vasquez": matchmakingPersonaElenaVasquez,
} as const satisfies Record<MatchmakingSimPersonaSlug, MatchmakingPersona>;

export type MatchmakingPersonaSlug = keyof typeof matchmakingPersonas;

export function getMatchmakingPersona(slug: MatchmakingPersonaSlug): MatchmakingPersona {
  return matchmakingPersonas[slug];
}

/** Map slugs to Party A vs Party B personas (first vs second seat in intro-request orchestration). */
export function pairMatchmakingPersonas(
  requesterSlug: MatchmakingPersonaSlug,
  requesteeSlug: MatchmakingPersonaSlug,
): { requester: MatchmakingPersona; requestee: MatchmakingPersona } {
  return {
    requester: matchmakingPersonas[requesterSlug],
    requestee: matchmakingPersonas[requesteeSlug],
  };
}
