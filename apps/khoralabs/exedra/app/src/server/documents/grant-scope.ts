import type { Database } from "bun:sqlite";
import {
  canContributeToSessionKg,
  canContributeToTeamKg,
  canReadPersonalKg,
  canReadSessionKg,
  enforce,
  getOrgIdForTeam,
  ResourceType,
  ScopeType,
} from "../authz/policy.js";
import { userScope } from "../memories/namespaces.js";
import type { DocumentGrantResource, DocumentRecord } from "./types.js";

export function resolveSessionUploadGrantResource(sessionId: string): DocumentGrantResource {
  return { type: ResourceType.Session, id: sessionId };
}

export function resolveContributionGrantResource(args: {
  userId: string;
  targetNamespace: string;
  sessionId?: string | null;
  teamId?: string | null;
  orgId?: string | null;
}): DocumentGrantResource {
  const userNamespace = userScope(args.userId);

  if (args.sessionId !== null && args.sessionId !== undefined && args.sessionId.length > 0) {
    return { type: ResourceType.Session, id: args.sessionId };
  }
  if (args.targetNamespace === userNamespace) {
    return { type: ScopeType.Account, id: args.userId };
  }
  if (args.teamId !== null && args.teamId !== undefined && args.teamId.length > 0) {
    return { type: ResourceType.Team, id: args.teamId };
  }
  if (args.orgId !== null && args.orgId !== undefined && args.orgId.length > 0) {
    return { type: ResourceType.Organization, id: args.orgId };
  }
  throw new Error("Could not resolve grant resource for contribution");
}

export async function userCanContributeViaGrant(
  _db: Database,
  userId: string,
  resource: DocumentGrantResource,
): Promise<boolean> {
  switch (resource.type) {
    case ScopeType.Account:
      return resource.id === userId;
    case ResourceType.Organization:
      return await enforce(userId, "org:member", {
        type: ResourceType.Organization,
        id: resource.id,
      });
    case ResourceType.Team:
      return await canContributeToTeamKg(userId, resource.id);
    case ResourceType.Session:
      return await canContributeToSessionKg(userId, resource.id);
    default:
      return false;
  }
}

export async function userCanViewDocumentsForGrant(
  _db: Database,
  userId: string,
  resource: DocumentGrantResource,
): Promise<boolean> {
  switch (resource.type) {
    case ScopeType.Account:
      return await canReadPersonalKg(userId, resource.id);
    case ResourceType.Organization:
      return await enforce(userId, "org:read", {
        type: ResourceType.Organization,
        id: resource.id,
      });
    case ResourceType.Team:
      return await enforce(userId, "team:read", { type: ResourceType.Team, id: resource.id });
    case ResourceType.Session:
      return await canReadSessionKg(userId, resource.id);
    default:
      return false;
  }
}

export function documentMatchesGrantResource(
  document: Pick<DocumentRecord, "grantResourceType" | "grantResourceId">,
  resource: DocumentGrantResource,
): boolean {
  return document.grantResourceType === resource.type && document.grantResourceId === resource.id;
}

export async function resolveDocumentOrgId(
  db: Database,
  document: Pick<DocumentRecord, "grantResourceType" | "grantResourceId" | "orgId">,
): Promise<string | null> {
  if (document.orgId !== null) return document.orgId;
  if (document.grantResourceType === ResourceType.Organization) {
    return document.grantResourceId;
  }
  if (document.grantResourceType === ResourceType.Team) {
    return getOrgIdForTeam(document.grantResourceId);
  }
  if (document.grantResourceType === ResourceType.Session) {
    const sessionRow = db
      .query<{ team_id: string }, [string]>(`SELECT team_id FROM sessions WHERE id = ? LIMIT 1`)
      .get(document.grantResourceId);
    if (sessionRow === null) return null;
    return getOrgIdForTeam(sessionRow.team_id);
  }
  return null;
}

export function resolveDocumentTeamId(
  document: Pick<DocumentRecord, "grantResourceType" | "grantResourceId" | "teamId">,
): string | null {
  if (document.teamId !== null) return document.teamId;
  if (document.grantResourceType === ResourceType.Team) {
    return document.grantResourceId;
  }
  return null;
}
