import { type NamespacePath, namespaceFromSegments } from "@khoralabs/memories-node";

import { encodePrincipalIdForMemories } from "./encode-principal-id.js";

const GLOBAL_ROOT = "_global_" as NamespacePath;

/** Org namespace under company: org/{orgId} */
export function orgScope(orgId: string): NamespacePath {
  const encoded = encodePrincipalIdForMemories(orgId);
  return namespaceFromSegments(["org", encoded]);
}

/** Team namespace under org: org/{orgId}/team/{teamId} */
export function orgTeamScope(orgId: string, teamId: string): NamespacePath {
  const encoded = encodePrincipalIdForMemories(orgId);
  return namespaceFromSegments(["org", encoded, "team", teamId]);
}

/** Session namespace under team: org/{orgId}/team/{teamId}/session/{sessionId} */
export function orgSessionScope(orgId: string, teamId: string, sessionId: string): NamespacePath {
  const encoded = encodePrincipalIdForMemories(orgId);
  return namespaceFromSegments(["org", encoded, "team", teamId, "session", sessionId]);
}

/** User global namespace: {userId} */
export function userScope(userId: string): NamespacePath {
  const encoded = encodePrincipalIdForMemories(userId);
  return namespaceFromSegments([encoded]);
}

/** User team namespace: {userId}/org/{orgId}/team/{teamId} */
export function userTeamScope(userId: string, orgId: string, teamId: string): NamespacePath {
  const encodedUser = encodePrincipalIdForMemories(userId);
  const encodedOrg = encodePrincipalIdForMemories(orgId);
  return namespaceFromSegments([encodedUser, "org", encodedOrg, "team", teamId]);
}

/**
 * User session namespace: {userId}/org/{orgId}/team/{teamId}/{sessionId}
 * Session id is the leaf segment (memories max depth 6; no room for a literal `session` segment).
 */
export function userSessionScope(
  userId: string,
  orgId: string,
  teamId: string,
  sessionId: string,
): NamespacePath {
  const encodedUser = encodePrincipalIdForMemories(userId);
  const encodedOrg = encodePrincipalIdForMemories(orgId);
  return namespaceFromSegments([encodedUser, "org", encodedOrg, "team", teamId, sessionId]);
}

export function ensureScopeChainPaths(
  scopePaths: readonly NamespacePath[],
): readonly NamespacePath[] {
  return scopePaths;
}

export function namespaceScopeChainPaths(targetNamespace: NamespacePath): NamespacePath[] {
  const segments = targetNamespace.split("/").filter((segment) => segment.length > 0);
  if (segments.length === 0) return [];
  const paths: NamespacePath[] = [GLOBAL_ROOT];
  let built = "";
  for (const segment of segments) {
    built = built.length > 0 ? `${built}/${segment}` : segment;
    paths.push(built as NamespacePath);
  }
  return paths;
}

export function ensureNamespaceScopeChainPaths(targetNamespace: NamespacePath): NamespacePath[] {
  return namespaceScopeChainPaths(targetNamespace);
}
