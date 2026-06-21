import type { AccountRow, OrgMemberContext, TeamMemberContext } from "@shared/accounts/row";
import type { OrgTeamContext, TeamRow } from "@shared/teams/row";

export type EntitySettings = {
  id: string;
  name: string;
  avatarUrl: string | null;
  canEdit: boolean;
  permissions?: Record<string, boolean>;
  networkOptedInAtMs?: number | null;
  networkJoinAvailable?: boolean;
};

export type OrgMemberRow = AccountRow<OrgMemberContext>;
export type TeamMemberRow = AccountRow<TeamMemberContext>;

export type OrgMemberProfile = OrgMemberRow;

export type OrgTeamSummary = TeamRow<OrgTeamContext>;

export type TeamMemberSummary = TeamMemberRow;

export type OrgMemberSummary = OrgMemberRow;

export type TeamSettings = EntitySettings & {
  orgId: string;
};

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

export async function fetchOrgMembers(orgId: string): Promise<OrgMemberSummary[]> {
  const res = await fetch(`/api/orgs/${encodeURIComponent(orgId)}/members`, {
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Failed to load organization members"));
  }
  const data = (await res.json()) as { members: OrgMemberSummary[] };
  return data.members;
}

export async function fetchOrgMemberProfile(
  orgId: string,
  userId: string,
): Promise<OrgMemberProfile> {
  const res = await fetch(
    `/api/orgs/${encodeURIComponent(orgId)}/members/${encodeURIComponent(userId)}`,
    { credentials: "include" },
  );
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Failed to load member profile"));
  }
  return (await res.json()) as OrgMemberProfile;
}

export async function fetchOrgTeams(orgId: string): Promise<OrgTeamSummary[]> {
  const res = await fetch(`/api/orgs/${encodeURIComponent(orgId)}/teams`, {
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Failed to load organization teams"));
  }
  const data = (await res.json()) as { teams: OrgTeamSummary[] };
  return data.teams;
}

export async function fetchTeamMembers(teamId: string): Promise<TeamMemberSummary[]> {
  const res = await fetch(`/api/teams/${encodeURIComponent(teamId)}/members`, {
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Failed to load team members"));
  }
  const data = (await res.json()) as { members: TeamMemberSummary[] };
  return data.members;
}

export async function fetchOrgSettings(orgId: string): Promise<EntitySettings> {
  const res = await fetch(`/api/orgs/${encodeURIComponent(orgId)}/settings`, {
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Failed to load organization settings"));
  }
  return (await res.json()) as EntitySettings;
}

export async function patchOrgSettings(
  orgId: string,
  body: { name: string },
): Promise<EntitySettings> {
  const res = await fetch(`/api/orgs/${encodeURIComponent(orgId)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Could not save organization"));
  }
  return (await res.json()) as EntitySettings;
}

export async function uploadOrgAvatar(orgId: string, file: File): Promise<EntitySettings> {
  const formData = new FormData();
  formData.set("file", file);
  const res = await fetch(`/api/orgs/${encodeURIComponent(orgId)}/avatar`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Could not upload avatar"));
  }
  return (await res.json()) as EntitySettings;
}

export async function deleteOrgAvatar(orgId: string): Promise<EntitySettings> {
  const res = await fetch(`/api/orgs/${encodeURIComponent(orgId)}/avatar`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Could not remove avatar"));
  }
  return (await res.json()) as EntitySettings;
}

export async function joinOrgNetwork(orgId: string): Promise<{ networkOptedInAtMs: number }> {
  const res = await fetch(`/api/orgs/${encodeURIComponent(orgId)}/join-network`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Could not join Khora network"));
  }
  return (await res.json()) as { networkOptedInAtMs: number };
}

export async function fetchTeamSettings(teamId: string): Promise<TeamSettings> {
  const res = await fetch(`/api/teams/${encodeURIComponent(teamId)}/settings`, {
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Failed to load team settings"));
  }
  return (await res.json()) as TeamSettings;
}

export async function patchTeamSettings(
  teamId: string,
  body: { name: string },
): Promise<TeamSettings> {
  const res = await fetch(`/api/teams/${encodeURIComponent(teamId)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Could not save team"));
  }
  return (await res.json()) as TeamSettings;
}

export async function uploadTeamAvatar(teamId: string, file: File): Promise<TeamSettings> {
  const formData = new FormData();
  formData.set("file", file);
  const res = await fetch(`/api/teams/${encodeURIComponent(teamId)}/avatar`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Could not upload avatar"));
  }
  return (await res.json()) as TeamSettings;
}

export async function deleteTeamAvatar(teamId: string): Promise<TeamSettings> {
  const res = await fetch(`/api/teams/${encodeURIComponent(teamId)}/avatar`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Could not remove avatar"));
  }
  return (await res.json()) as TeamSettings;
}

export async function uploadMeAvatar(
  orgId: string,
  file: File,
): Promise<{ avatarUrl: string | null }> {
  const formData = new FormData();
  formData.set("file", file);
  formData.set("orgId", orgId);
  const res = await fetch("/api/me/avatar", {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Could not upload avatar"));
  }
  const data = (await res.json()) as { user: { avatarUrl: string | null } };
  return { avatarUrl: data.user.avatarUrl };
}

export async function deleteMeAvatar(): Promise<{ avatarUrl: string | null }> {
  const res = await fetch("/api/me/avatar", {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Could not remove avatar"));
  }
  const data = (await res.json()) as { user: { avatarUrl: string | null } };
  return { avatarUrl: data.user.avatarUrl };
}
