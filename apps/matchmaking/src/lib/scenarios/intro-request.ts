import { type MatchmakingPersonaSlug, pairMatchmakingPersonas } from "../personas/index.ts";
import type { MatchmakingPersona } from "../personas/types.ts";
import type { MatchmakingScenario } from "./matchmaking-scenario.ts";

async function buildIntroFromPersonas(
  requester: MatchmakingPersona,
  requestee: MatchmakingPersona,
  options?: { invitationMessage?: string },
): Promise<MatchmakingScenario> {
  const [requesterIdentity, requesteeIdentity] = await Promise.all([
    requester.buildRegisteredIdentity(),
    requestee.buildRegisteredIdentity(),
  ]);

  const invitation = options?.invitationMessage?.trim();
  return {
    title: "Intro request (matchmaking)",
    parties: [requesterIdentity, requesteeIdentity],
    maxRounds: 12,
    personaSeeds: [[...requester.memorySeeds], [...requestee.memorySeeds]],
    partyMemoryNamespaces: [requester.memoryNamespace, requestee.memoryNamespace],
    ...(invitation ? { partyAInvitationMessage: invitation } : {}),
  };
}

/**
 * Builds the standard intro-request matchmaking scenario for a persona pair
 * (e.g. `buildIntroRequestScenarioPair("p2", "p1")` to swap sides for compatibility tests).
 * Pass `options.invitationMessage` to seed the shared thread with Party A–authored text before round 0.
 */
export async function buildIntroRequestScenarioPair(
  requesterSlug: MatchmakingPersonaSlug,
  requesteeSlug: MatchmakingPersonaSlug,
  options?: { invitationMessage?: string },
): Promise<MatchmakingScenario> {
  const { requester, requestee } = pairMatchmakingPersonas(requesterSlug, requesteeSlug);
  return buildIntroFromPersonas(requester, requestee, options);
}
