import { type MatchmakingPersonaSlug, matchmakingPersonas } from "./personas/index.ts";
import { resolveMatchmakingNegotiatorDisplayName } from "./personas/negotiator-display-name.ts";
import { resolveMatchmakingSubjectId } from "./resolve-subject-id.ts";

const PERSONA_ORDER: MatchmakingPersonaSlug[] = ["p1", "p2", "p3"];

export type PersonaPublicDto = {
  slug: string;
  name: string;
  agentId: string;
  subjectId: string;
  memoryNamespace: string;
  profile: { tagline: string; about: string };
};

export async function listPersonaPublicDtos(): Promise<PersonaPublicDto[]> {
  const subjectId = resolveMatchmakingSubjectId();
  const out: PersonaPublicDto[] = [];
  for (const slug of PERSONA_ORDER) {
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
    });
  }
  return out;
}
