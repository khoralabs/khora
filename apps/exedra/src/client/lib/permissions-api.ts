import type { OrgPermission, TeamPermission } from "@shared/authz/permissions";

export type PermissionsSnapshot = {
  accountId: string;
  canEdit: boolean;
  granted: string[];
  permissions: Record<string, boolean>;
};

export type GrantSlice = {
  granted: string[];
  permissions: Record<string, boolean>;
};

export type TeamGrantsSnapshot = {
  teamId: string;
  orgId: string;
  canEdit: boolean;
  org: GrantSlice;
  team: GrantSlice;
};

const EMPTY_ORG_PERMISSIONS: Record<string, boolean> = {
  permissions_manage: false,
  write: false,
  read: false,
  team_manage: false,
  member_manage: false,
};

function isGrantSlice(value: unknown): value is GrantSlice {
  if (typeof value !== "object" || value === null) return false;
  const slice = value as GrantSlice;
  return Array.isArray(slice.granted) && typeof slice.permissions === "object";
}

function parseTeamGrantsSnapshot(raw: unknown): TeamGrantsSnapshot {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Failed to load team permissions");
  }

  const body = raw as Record<string, unknown>;
  if (isGrantSlice(body.org) && isGrantSlice(body.team)) {
    return {
      teamId: String(body.teamId ?? ""),
      orgId: String(body.orgId ?? ""),
      canEdit: body.canEdit === true,
      org: body.org,
      team: body.team,
    };
  }

  // Legacy flat team-scope payload from stale route handlers under --hot.
  if (
    Array.isArray(body.granted) &&
    typeof body.permissions === "object" &&
    body.permissions !== null
  ) {
    return {
      teamId: String(body.teamId ?? ""),
      orgId: String(body.orgId ?? ""),
      canEdit: body.canEdit === true,
      org: { granted: [], permissions: { ...EMPTY_ORG_PERMISSIONS } },
      team: {
        granted: body.granted as string[],
        permissions: body.permissions as Record<string, boolean>,
      },
    };
  }

  throw new Error("Failed to load team permissions");
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  const text = await res.text();
  try {
    const data = JSON.parse(text) as { error?: string };
    if (data.error !== undefined && data.error.length > 0) return data.error;
  } catch {
    // keep fallback
  }
  return fallback;
}

async function readJsonBody<T>(res: Response, parse: (raw: unknown) => T): Promise<T> {
  const text = await res.text();
  if (text.trim().length === 0) {
    throw new Error("Failed to load team permissions");
  }
  try {
    return parse(JSON.parse(text) as unknown);
  } catch (err) {
    if (err instanceof Error && err.message !== "Failed to load team permissions") {
      throw err;
    }
    throw new Error("Failed to load team permissions");
  }
}

export async function fetchOrgMemberPermissions(
  orgId: string,
  userId: string,
): Promise<PermissionsSnapshot> {
  const res = await fetch(
    `/api/orgs/${encodeURIComponent(orgId)}/members/${encodeURIComponent(userId)}/permissions`,
    { credentials: "include" },
  );
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Failed to load organization permissions"));
  }
  return readJsonBody(res, (raw) => raw as PermissionsSnapshot);
}

export async function patchOrgMemberPermissions(
  orgId: string,
  userId: string,
  permissions: OrgPermission[],
): Promise<PermissionsSnapshot> {
  const res = await fetch(
    `/api/orgs/${encodeURIComponent(orgId)}/members/${encodeURIComponent(userId)}/permissions`,
    {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions }),
    },
  );
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Could not save organization permissions"));
  }
  return readJsonBody(res, (raw) => raw as PermissionsSnapshot);
}

export async function fetchTeamPermissions(teamId: string): Promise<TeamGrantsSnapshot> {
  const res = await fetch(`/api/teams/${encodeURIComponent(teamId)}/permissions`, {
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Failed to load team permissions"));
  }
  return readJsonBody(res, parseTeamGrantsSnapshot);
}

export async function patchTeamPermissions(
  teamId: string,
  grantScope: "org" | "team",
  permissions: OrgPermission[] | TeamPermission[],
): Promise<TeamGrantsSnapshot> {
  const res = await fetch(`/api/teams/${encodeURIComponent(teamId)}/permissions`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grantScope, permissions }),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Could not save team permissions"));
  }
  return readJsonBody(res, parseTeamGrantsSnapshot);
}
