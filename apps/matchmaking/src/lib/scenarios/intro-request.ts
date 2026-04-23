import { appUserMemoryNamespace } from "../memories/app-user-memory-namespace.ts";
import { buildAppUserRegisteredIdentity } from "../personas/app-user-negotiator-identity.ts";
import {
  type MatchmakingPersonaSlug,
  getMatchmakingPersona,
  pairMatchmakingPersonas,
} from "../personas/index.ts";
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
 * Party A = experiential app user (no persona seeds, dedicated namespace);
 * Party B = selected simulated profile (offline-seeded `memorySeeds` in tooling only).
 */
export async function buildAppUserIntroRequestScenario(
  inviteeSlug: MatchmakingPersonaSlug,
  options?: { invitationMessage?: string },
): Promise<MatchmakingScenario> {
  const requestee = getMatchmakingPersona(inviteeSlug);
  const [requesterIdentity, requesteeIdentity] = await Promise.all([
    buildAppUserRegisteredIdentity(),
    requestee.buildRegisteredIdentity(),
  ]);
  const invitation = options?.invitationMessage?.trim();
  return {
    title: "Intro request (matchmaking)",
    parties: [requesterIdentity, requesteeIdentity],
    maxRounds: 12,
    personaSeeds: [[], [...requestee.memorySeeds]],
    partyMemoryNamespaces: [appUserMemoryNamespace(), requestee.memoryNamespace],
    ...(invitation ? { partyAInvitationMessage: invitation } : {}),
  };
}

/**
 * Two simulated personae (both offline-seeded). For the product flow use
 * {@link buildAppUserIntroRequestScenario} (user inviter + one demo invitee).
 *
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
