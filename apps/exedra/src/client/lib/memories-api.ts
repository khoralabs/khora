export function encodePrincipalIdForMemories(principalId: string): string {
  const bytes = new TextEncoder().encode(principalId);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").toLowerCase();
}

export function orgTeamNamespace(orgId: string, teamId: string): string {
  return `org/${orgId}/team/${teamId}`;
}

export function orgSessionNamespace(orgId: string, teamId: string, sessionId: string): string {
  return `org/${orgId}/team/${teamId}/session/${sessionId}`;
}

export function userNamespace(userId: string): string {
  return encodePrincipalIdForMemories(userId);
}

export function orgMemoriesApiBase(orgId: string): string {
  return `/api/memories/org/${encodeURIComponent(orgId)}`;
}

export const meMemoriesApiBase = "/api/memories/me";
