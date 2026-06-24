import type { AuthzRepository } from "./repository";
import { EntityType, Relation } from "./taxonomy";
import type { EntityRef } from "./types";

/** Grant scopes checked for a subject, including agent/org aliases used by Exedra. */
export async function effectiveGrantSubjects(
  repo: AuthzRepository,
  subject: EntityRef,
): Promise<EntityRef[]> {
  const subjects: EntityRef[] = [subject];

  if (subject.type === EntityType.Agent) {
    const orgs = await repo.getRelatedTo(subject, Relation.Represents, EntityType.Organization);
    for (const org of orgs) {
      subjects.push({ type: EntityType.Account, id: org.id });
    }
  }

  if (subject.type === EntityType.Organization) {
    subjects.push({ type: EntityType.Account, id: subject.id });
  }

  return subjects;
}

export async function orgIdsForAgent(repo: AuthzRepository, agentId: string): Promise<string[]> {
  const orgs = await repo.getRelatedTo(
    { type: EntityType.Agent, id: agentId },
    Relation.Represents,
    EntityType.Organization,
  );
  return orgs.map((org) => org.id);
}
