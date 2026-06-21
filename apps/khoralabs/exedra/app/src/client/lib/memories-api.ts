import { createHash } from "node:crypto";

const MEMORY_PRINCIPAL_SEGMENT_LENGTH = 22;

export function encodePrincipalIdForMemories(principalId: string): string {
  return createHash("sha256")
    .update(principalId, "utf8")
    .digest("base64url")
    .slice(0, MEMORY_PRINCIPAL_SEGMENT_LENGTH)
    .toLowerCase();
}

export function orgTeamNamespace(orgId: string, teamId: string): string {
  const encodedOrg = encodePrincipalIdForMemories(orgId);
  return `org/${encodedOrg}/team/${teamId}`;
}

export function orgSessionNamespace(orgId: string, teamId: string, sessionId: string): string {
  const encodedOrg = encodePrincipalIdForMemories(orgId);
  return `org/${encodedOrg}/team/${teamId}/session/${sessionId}`;
}

export function userNamespace(userId: string): string {
  return encodePrincipalIdForMemories(userId);
}

export function orgMemoriesApiBase(orgId: string): string {
  return `/api/memories/org/${encodeURIComponent(orgId)}`;
}

export const meMemoriesApiBase = "/api/memories/me";
