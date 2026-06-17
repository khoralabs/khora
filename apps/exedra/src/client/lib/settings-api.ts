export type EntitySettings = {
  id: string;
  name: string;
  avatarUrl: string | null;
  canEdit: boolean;
};

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
