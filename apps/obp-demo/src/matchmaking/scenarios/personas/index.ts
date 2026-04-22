import { matchmakingPersonaP1 } from "./p1.ts";
import { matchmakingPersonaP2 } from "./p2.ts";
import { matchmakingPersonaP3 } from "./p3.ts";
import type { MatchmakingPersona } from "./types.ts";

export type { MatchmakingPersona } from "./types.ts";
export { matchmakingPersonaP1, matchmakingPersonaP2, matchmakingPersonaP3 };

/** Registered personas for matchmaking demos; add a module + entry here to test new pairs. */
export const matchmakingPersonas = {
  p1: matchmakingPersonaP1,
  p2: matchmakingPersonaP2,
  p3: matchmakingPersonaP3,
} as const;

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
