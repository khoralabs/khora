const ORG_KEY = "exedra.activeOrgId";
const TEAM_KEY = "exedra.activeTeamId";

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable — ignore
  }
}

export function readActiveSelection(): { orgId: string | null; teamId: string | null } {
  return { orgId: safeGet(ORG_KEY), teamId: safeGet(TEAM_KEY) };
}

export function writeActiveSelection(orgId: string, teamId: string): void {
  safeSet(ORG_KEY, orgId);
  safeSet(TEAM_KEY, teamId);
}
