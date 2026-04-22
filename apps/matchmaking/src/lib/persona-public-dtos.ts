import { type MatchmakingPersonaSlug, matchmakingPersonas } from "./personas/index.ts";

const PERSONA_ORDER: MatchmakingPersonaSlug[] = ["p1", "p2", "p3"];

export type PersonaPublicDto = {
  slug: string;
  name: string;
  agentId: string;
  memoryNamespace: string;
  profile: { tagline: string; about: string };
};

export async function listPersonaPublicDtos(): Promise<PersonaPublicDto[]> {
  const out: PersonaPublicDto[] = [];
  for (const slug of PERSONA_ORDER) {
    const p = matchmakingPersonas[slug];
    const identity = await p.buildRegisteredIdentity();
    out.push({
      slug: p.slug,
      name: identity.name,
      agentId: identity.agentId,
      memoryNamespace: p.memoryNamespace,
      profile: { tagline: p.profile.tagline, about: p.profile.about },
    });
  }
  return out;
}
