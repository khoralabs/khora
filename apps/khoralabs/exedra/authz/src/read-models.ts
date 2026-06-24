import type { AuthzRepository } from "./repository";
import { EntityType, Feature, Relation } from "./taxonomy";
import type { EntityRef, GrantRecord } from "./types";

function account(id: string): EntityRef {
  return { type: EntityType.Account, id };
}

function org(id: string): EntityRef {
  return { type: EntityType.Organization, id };
}

function team(id: string): EntityRef {
  return { type: EntityType.Team, id };
}

function session(id: string): EntityRef {
  return { type: EntityType.Session, id };
}

export async function getOrgIdForTeam(
  repo: AuthzRepository,
  teamId: string,
): Promise<string | null> {
  const orgs = await repo.getRelatedTo(team(teamId), Relation.MemberOf, EntityType.Organization);
  if (orgs.length > 0) return orgs[0]?.id ?? null;
  const grants = await repo.listGrantsForScope(team(teamId));
  for (const row of grants) {
    if (row.resourceType === EntityType.Organization && row.feature === Feature.Member) {
      return row.resourceId;
    }
  }
  return null;
}

export async function getTeamIdForSession(
  repo: AuthzRepository,
  sessionId: string,
): Promise<string | null> {
  const teams = await repo.getRelatedTo(session(sessionId), Relation.BelongsTo, EntityType.Team);
  return teams[0]?.id ?? null;
}

export async function getSessionIdForThread(
  repo: AuthzRepository,
  threadId: string,
): Promise<string | null> {
  const sessions = await repo.getRelatedTo(
    { type: EntityType.Thread, id: threadId },
    Relation.BelongsTo,
    EntityType.Session,
  );
  return sessions[0]?.id ?? null;
}

export async function listTeamIdsForOrg(repo: AuthzRepository, orgId: string): Promise<string[]> {
  const related = await repo.listRelatedFrom(org(orgId), Relation.MemberOf, EntityType.Team);
  if (related.length > 0) return related.map((entity) => entity.id);
  return repo.listGrantScopeIdsForResource(org(orgId), Feature.Member, EntityType.Team);
}

export async function listAccountIdsForTeam(
  repo: AuthzRepository,
  teamId: string,
  feature: string = Feature.Member,
): Promise<string[]> {
  return repo.listGrantScopeIdsForResource(team(teamId), feature, EntityType.Account);
}

export async function listAccountIdsForOrgAdmin(
  repo: AuthzRepository,
  orgId: string,
): Promise<string[]> {
  return repo.listGrantScopeIdsForResource(org(orgId), Feature.Admin, EntityType.Account);
}

export async function listTeamIdsForAccount(
  repo: AuthzRepository,
  accountId: string,
): Promise<string[]> {
  return repo.listGrantResourceIdsForScope(account(accountId), Feature.Member, EntityType.Team);
}

export async function userHasAnyTeamMemberGrant(
  repo: AuthzRepository,
  accountId: string,
): Promise<boolean> {
  return repo.scopeHasAnyGrant(account(accountId), EntityType.Team, Feature.Member);
}

export async function userHasAnySessionParticipantGrant(
  repo: AuthzRepository,
  accountId: string,
): Promise<boolean> {
  return repo.scopeHasAnyGrant(account(accountId), EntityType.Session, Feature.Participant);
}

export async function listGrantsForScope(
  repo: AuthzRepository,
  scope: EntityRef,
): Promise<GrantRecord[]> {
  return repo.listGrantsForScope(scope);
}

export async function listGrantScopeIdsForResource(
  repo: AuthzRepository,
  resource: EntityRef,
  feature: string,
  scopeType: string,
): Promise<string[]> {
  return repo.listGrantScopeIdsForResource(resource, feature, scopeType);
}

export async function hasGrant(
  repo: AuthzRepository,
  scope: EntityRef,
  resource: EntityRef,
  feature: string,
): Promise<boolean> {
  return repo.hasGrant(scope, resource, feature);
}

export async function listRelatedFrom(
  repo: AuthzRepository,
  to: EntityRef,
  relation: string,
  fromType?: string,
): Promise<EntityRef[]> {
  return repo.listRelatedFrom(to, relation, fromType);
}

export async function listRelatedTo(
  repo: AuthzRepository,
  from: EntityRef,
  relation: string,
  toType?: string,
): Promise<EntityRef[]> {
  return repo.getRelatedTo(from, relation, toType);
}

export async function listSessionIdsForAccount(
  repo: AuthzRepository,
  accountId: string,
  feature: string,
): Promise<string[]> {
  return repo.listGrantScopeIdsForResource(account(accountId), feature, EntityType.Session);
}

export async function listTeamIdsWithSessionGrant(
  repo: AuthzRepository,
  sessionId: string,
  feature: string,
): Promise<string[]> {
  return repo.listGrantScopeIdsForResource(session(sessionId), feature, EntityType.Team);
}
