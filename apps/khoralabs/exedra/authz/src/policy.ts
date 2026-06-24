import { parseChatThreadId } from "./chat-thread";
import type { AuthzRepository } from "./repository";
import { effectiveGrantSubjects, orgIdsForAgent } from "./subject-expansion";
import {
  AuthAction,
  EntityType,
  Feature,
  OrgPermission,
  Relation,
  TeamPermission,
} from "./taxonomy";
import type { DecideRequest, DecideResponse, EntityRef } from "./types";

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

function thread(id: string): EntityRef {
  return { type: EntityType.Thread, id };
}

export async function decide(
  repo: AuthzRepository,
  request: DecideRequest,
): Promise<DecideResponse> {
  const allowed = await isAllowed(repo, request);
  const response: DecideResponse = { allowed };
  await repo
    .recordDecision({
      subject: request.subject,
      action: request.action,
      resource: request.resource,
      allowed,
      reason: allowed ? "allowed" : "denied",
    })
    .catch(() => undefined);
  return response;
}

async function isAllowed(repo: AuthzRepository, request: DecideRequest): Promise<boolean> {
  const subject = request.subject;
  const resource = request.resource;

  switch (request.action) {
    case AuthAction.TeamMember:
      return resource.type === EntityType.Team && hasTeamMember(repo, subject, resource.id);
    case AuthAction.TeamAdmin:
      return (
        resource.type === EntityType.Team &&
        hasTeamPermission(repo, subject, resource.id, Feature.Admin)
      );
    case AuthAction.TeamRead:
      return (
        resource.type === EntityType.Team &&
        hasTeamPermission(repo, subject, resource.id, TeamPermission.Read)
      );
    case AuthAction.TeamWrite:
      return (
        resource.type === EntityType.Team &&
        hasTeamPermission(repo, subject, resource.id, TeamPermission.Write)
      );
    case AuthAction.TeamMemberManage:
      return (
        resource.type === EntityType.Team &&
        hasTeamPermission(repo, subject, resource.id, TeamPermission.MemberManage)
      );
    case AuthAction.TeamSessionCreate:
      return resource.type === EntityType.Team && canCreateSession(repo, subject, resource.id);
    case AuthAction.OrgMember:
      return resource.type === EntityType.Organization && belongsToOrg(repo, subject, resource.id);
    case AuthAction.OrgAdmin:
      return (
        resource.type === EntityType.Organization && hasOrgAdminGrant(repo, subject, resource.id)
      );
    case AuthAction.OrgRead:
      return (
        resource.type === EntityType.Organization &&
        hasOrgPermission(repo, subject, resource.id, OrgPermission.Read)
      );
    case AuthAction.OrgWrite:
      return (
        resource.type === EntityType.Organization &&
        hasOrgPermission(repo, subject, resource.id, OrgPermission.Write)
      );
    case AuthAction.OrgPermissionsManage:
      return (
        resource.type === EntityType.Organization &&
        hasOrgPermission(repo, subject, resource.id, OrgPermission.PermissionsManage)
      );
    case AuthAction.OrgTeamManage:
      return (
        resource.type === EntityType.Organization &&
        hasOrgPermission(repo, subject, resource.id, OrgPermission.TeamManage)
      );
    case AuthAction.OrgMemberManage:
      return (
        resource.type === EntityType.Organization &&
        hasOrgPermission(repo, subject, resource.id, OrgPermission.MemberManage)
      );
    case AuthAction.OrgSessionCreate:
      return (
        resource.type === EntityType.Organization &&
        hasOrgPermission(repo, subject, resource.id, OrgPermission.SessionCreate)
      );
    case AuthAction.SessionView:
      return resource.type === EntityType.Session && canViewSession(repo, subject, resource.id);
    case AuthAction.ThreadRead:
      return resource.type === EntityType.Thread && canReadThread(repo, subject, resource.id);
    case AuthAction.DocumentRead:
      return canReadProtectedResource(repo, subject, resource);
    case AuthAction.MemoryRead:
      return canReadProtectedResource(repo, subject, resource);
    case AuthAction.ChatThreadWrite:
      return canWriteChatThread(repo, subject, resource);
    default:
      return false;
  }
}

async function hasTeamMember(repo: AuthzRepository, subject: EntityRef, teamId: string) {
  return repo.hasGrant(subject, team(teamId), Feature.Member);
}

async function hasOrgAdminGrant(repo: AuthzRepository, subject: EntityRef, orgId: string) {
  return repo.hasGrant(subject, org(orgId), Feature.Admin);
}

async function hasTeamAdminGrant(repo: AuthzRepository, subject: EntityRef, teamId: string) {
  return repo.hasGrant(subject, team(teamId), Feature.Admin);
}

async function teamsForOrg(repo: AuthzRepository, orgId: string): Promise<EntityRef[]> {
  return repo.listRelatedFrom(org(orgId), Relation.MemberOf, EntityType.Team);
}

async function orgForTeam(repo: AuthzRepository, teamId: string): Promise<EntityRef | null> {
  const orgs = await repo.getRelatedTo(team(teamId), Relation.MemberOf, EntityType.Organization);
  return orgs[0] ?? null;
}

async function belongsToOrg(
  repo: AuthzRepository,
  subject: EntityRef,
  orgId: string,
): Promise<boolean> {
  for (const orgTeam of await teamsForOrg(repo, orgId)) {
    if (await hasTeamMember(repo, subject, orgTeam.id)) return true;
  }
  return false;
}

async function hasOrgPermission(
  repo: AuthzRepository,
  subject: EntityRef,
  orgId: string,
  permission: string,
): Promise<boolean> {
  if (await hasOrgAdminGrant(repo, subject, orgId)) return true;
  if (permission === OrgPermission.Read && (await belongsToOrg(repo, subject, orgId))) return true;
  if (await repo.hasGrant(subject, org(orgId), permission)) return true;

  for (const orgTeam of await teamsForOrg(repo, orgId)) {
    if (!(await hasTeamMember(repo, subject, orgTeam.id))) continue;
    if (await repo.hasGrant(team(orgTeam.id), org(orgId), permission)) return true;
  }
  return false;
}

async function hasTeamPermission(
  repo: AuthzRepository,
  subject: EntityRef,
  teamId: string,
  permission: string,
): Promise<boolean> {
  if (await hasTeamAdminGrant(repo, subject, teamId)) return true;
  if (await repo.hasGrant(subject, team(teamId), permission)) return true;
  const isMember = await hasTeamMember(repo, subject, teamId);
  if (isMember && (await repo.hasGrant(team(teamId), team(teamId), permission))) return true;
  return permission === TeamPermission.Read && isMember;
}

async function canCreateSession(repo: AuthzRepository, subject: EntityRef, teamId: string) {
  if (!(await hasTeamMember(repo, subject, teamId))) return false;
  const teamOrg = await orgForTeam(repo, teamId);
  if (teamOrg === null) return false;
  return (
    (await hasTeamPermission(repo, subject, teamId, TeamPermission.SessionCreate)) &&
    (await hasOrgPermission(repo, subject, teamOrg.id, OrgPermission.SessionCreate))
  );
}

async function hasInheritedTeamSessionGrant(
  repo: AuthzRepository,
  subject: EntityRef,
  sessionId: string,
  feature: string,
) {
  const teamIds = await repo.listGrantScopeIdsForResource(
    session(sessionId),
    feature,
    EntityType.Team,
  );
  for (const teamId of teamIds) {
    if (await hasTeamMember(repo, subject, teamId)) return true;
  }
  return false;
}

async function hasSessionAccess(repo: AuthzRepository, subject: EntityRef, sessionId: string) {
  if (await repo.hasGrant(subject, session(sessionId), Feature.Admin)) return true;
  if (await repo.hasGrant(subject, session(sessionId), Feature.Participant)) return true;
  if (await hasInheritedTeamSessionGrant(repo, subject, sessionId, Feature.Admin)) return true;
  return hasInheritedTeamSessionGrant(repo, subject, sessionId, Feature.Participant);
}

async function hasFacilitationAccess(repo: AuthzRepository, subject: EntityRef, sessionId: string) {
  if (await repo.hasGrant(subject, session(sessionId), Feature.Admin)) return true;
  if (await repo.hasGrant(subject, session(sessionId), Feature.Facilitation)) return true;
  if (await hasInheritedTeamSessionGrant(repo, subject, sessionId, Feature.Admin)) return true;
  return hasInheritedTeamSessionGrant(repo, subject, sessionId, Feature.Facilitation);
}

async function canManageSession(repo: AuthzRepository, subject: EntityRef, sessionId: string) {
  if (await repo.hasGrant(subject, session(sessionId), Feature.Admin)) return true;
  return hasInheritedTeamSessionGrant(repo, subject, sessionId, Feature.Admin);
}

async function canViewSession(repo: AuthzRepository, subject: EntityRef, sessionId: string) {
  return (
    (await hasSessionAccess(repo, subject, sessionId)) ||
    (await hasFacilitationAccess(repo, subject, sessionId))
  );
}

async function canReadThread(repo: AuthzRepository, subject: EntityRef, threadId: string) {
  if (await repo.hasGrant(subject, thread(threadId), Feature.Read)) return true;
  if (await repo.hasGrant(subject, thread(threadId), Feature.Write)) return true;
  const sessions = await repo.getRelatedTo(
    thread(threadId),
    Relation.BelongsTo,
    EntityType.Session,
  );
  const parent = sessions[0];
  return parent !== undefined && (await canManageSession(repo, subject, parent.id));
}

async function canWriteThread(repo: AuthzRepository, subject: EntityRef, threadId: string) {
  for (const grantSubject of await effectiveGrantSubjects(repo, subject)) {
    if (await repo.hasGrant(grantSubject, thread(threadId), Feature.Write)) return true;
  }
  const sessions = await repo.getRelatedTo(
    thread(threadId),
    Relation.BelongsTo,
    EntityType.Session,
  );
  const parent = sessions[0];
  if (parent === undefined) return false;
  for (const grantSubject of await effectiveGrantSubjects(repo, subject)) {
    if (await canManageSession(repo, grantSubject, parent.id)) return true;
  }
  return false;
}

async function canWriteChatThread(
  repo: AuthzRepository,
  subject: EntityRef,
  resource: EntityRef,
): Promise<boolean> {
  const threadId = resource.id;
  if (threadId.length === 0) return false;

  if (
    resource.type === EntityType.Thread ||
    resource.type === "chat_thread" ||
    resource.type === "thread"
  ) {
    if (await canWriteThread(repo, subject, threadId)) return true;

    const parsed = parseChatThreadId(threadId);
    if (parsed !== null) {
      return canWriteParsedChatThread(repo, subject, parsed);
    }
  }

  return false;
}

async function canWriteParsedChatThread(
  repo: AuthzRepository,
  subject: EntityRef,
  parsed: NonNullable<ReturnType<typeof parseChatThreadId>>,
): Promise<boolean> {
  if (parsed.kind === "facilitation") {
    for (const grantSubject of await effectiveGrantSubjects(repo, subject)) {
      if (await hasFacilitationAccess(repo, grantSubject, parsed.sessionId)) return true;
    }
    return false;
  }

  for (const grantSubject of await effectiveGrantSubjects(repo, subject)) {
    if (await hasSessionAccess(repo, grantSubject, parsed.sessionId)) return true;
  }

  if (subject.type === EntityType.Agent) {
    const participant = account(parsed.userId);
    if (await repo.hasGrant(participant, session(parsed.sessionId), Feature.Participant)) {
      const orgIds = await orgIdsForAgent(repo, subject.id);
      if (orgIds.length > 0) return true;
    }
  }

  return false;
}

async function canReadProtectedResource(
  repo: AuthzRepository,
  subject: EntityRef,
  resource: EntityRef,
) {
  if (resource.type === EntityType.Account && subject.id === resource.id) return true;

  for (const grantSubject of await effectiveGrantSubjects(repo, subject)) {
    if (await repo.hasGrant(grantSubject, resource, Feature.Read)) return true;
  }

  if (resource.type === EntityType.Session) {
    for (const grantSubject of await effectiveGrantSubjects(repo, subject)) {
      if (await repo.hasGrant(grantSubject, resource, Feature.Participant)) return true;
      if (await repo.hasGrant(grantSubject, resource, Feature.Admin)) return true;
    }
    if (subject.type === EntityType.Agent) {
      const teamId = await sessionTeamId(repo, resource.id);
      if (teamId !== null) {
        const orgId = await orgForTeam(repo, teamId);
        if (orgId !== null) {
          const agentOrgs = await orgIdsForAgent(repo, subject.id);
          if (agentOrgs.includes(orgId.id)) return true;
        }
      }
    }
    return false;
  }

  if (resource.type === EntityType.Team) {
    for (const grantSubject of await effectiveGrantSubjects(repo, subject)) {
      if (await hasTeamPermission(repo, grantSubject, resource.id, TeamPermission.Read)) {
        return true;
      }
    }
    return false;
  }

  if (resource.type === EntityType.Organization) {
    for (const grantSubject of await effectiveGrantSubjects(repo, subject)) {
      if (await hasOrgPermission(repo, grantSubject, resource.id, OrgPermission.Read)) {
        return true;
      }
    }
    return false;
  }

  if (resource.type === EntityType.Account) {
    for (const grantSubject of await effectiveGrantSubjects(repo, subject)) {
      if (grantSubject.type === EntityType.Agent && grantSubject.id === subject.id) {
        if (await repo.hasGrant(grantSubject, resource, Feature.Read)) return true;
      }
    }
  }

  const protectedBy = await repo.getRelatedTo(resource, Relation.ProtectedBy);
  for (const protectedResource of protectedBy) {
    if (await canReadProtectedResource(repo, subject, protectedResource)) return true;
  }
  return false;
}

async function sessionTeamId(repo: AuthzRepository, sessionId: string): Promise<string | null> {
  const teams = await repo.getRelatedTo(session(sessionId), Relation.BelongsTo, EntityType.Team);
  return teams[0]?.id ?? null;
}
