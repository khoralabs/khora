import { appUserMemoryNamespace } from "./memories/app-user-memory-namespace.ts";
import { buildAppUserRegisteredIdentity } from "./personas/app-user-negotiator-identity.ts";
import { matchmakingPersonas } from "./personas/index.ts";
import { MATCHMAKING_SIM_PERSONA_SLUGS } from "./personas/slugs.ts";
import { resolveMatchmakingNegotiatorDisplayName } from "./personas/negotiator-display-name.ts";
import { resolveMatchmakingSubjectId } from "./resolve-subject-id.ts";
import { readUserPublicProfileState } from "./user-public-profile.ts";

export type PersonaPublicDto = {
  slug: string;
  name: string;
  agentId: string;
  subjectId: string;
  memoryNamespace: string;
  profile: { tagline: string; about: string };
  role: "self" | "sim";
};

export async function listPersonaPublicDtos(): Promise<PersonaPublicDto[]> {
  const subjectId = resolveMatchmakingSubjectId();
  const out: PersonaPublicDto[] = [];

  const selfState = readUserPublicProfileState();
  if (selfState !== null) {
    const me = await buildAppUserRegisteredIdentity();
    out.push({
      slug: "_user_",
      name: selfState.displayName,
      agentId: me.agentId,
      subjectId,
      memoryNamespace: appUserMemoryNamespace(subjectId),
      profile: { tagline: selfState.tagline, about: selfState.about },
      role: "self",
    });
  }

  for (const slug of MATCHMAKING_SIM_PERSONA_SLUGS) {
    const p = matchmakingPersonas[slug];
    const identity = await p.buildRegisteredIdentity();
    out.push({
      slug: p.slug,
      name: resolveMatchmakingNegotiatorDisplayName({
        displayLabel: p.displayName,
        agentId: identity.agentId,
      }),
      agentId: identity.agentId,
      subjectId,
      memoryNamespace: p.memoryNamespace,
      profile: { tagline: p.profile.tagline, about: p.profile.about },
      role: "sim",
    });
  }
  return out;
}
