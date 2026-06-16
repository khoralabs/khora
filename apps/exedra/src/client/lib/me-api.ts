export type MeTeam = {
  id: string;
  name: string;
  orgId: string;
  orgName: string;
};

export type MeResponse = {
  user: {
    id: string;
    registryUserId: string;
    fullName: string | null;
    jobFunction: string | null;
  };
  teams: MeTeam[];
  onboardingRequired: boolean;
  onboardingInterviewRequired: boolean;
  onboardingSessionId: string | null;
};

export const ONBOARDING_PLACEHOLDER_TEAM: MeTeam = {
  id: "",
  name: "Your team",
  orgId: "",
  orgName: "Your organization",
};

export type OnboardingResponse = {
  org: { id: string; name: string };
  team: { id: string; name: string; orgId: string };
  onboardingSessionId: string;
};

export type CreateTeamResponse = {
  team: MeTeam;
};

export type TeamInviteResponse = {
  token: string;
  url: string;
};

export async function fetchMe(): Promise<MeResponse | null> {
  const res = await fetch("/api/me", { credentials: "include" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error("Failed to load profile");
  return (await res.json()) as MeResponse;
}

export async function patchMeProfile(body: {
  fullName?: string;
  jobFunction?: string;
}): Promise<MeResponse["user"]> {
  const res = await fetch("/api/me", {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = `Could not save profile (${res.status})`;
    try {
      const data = JSON.parse(text) as { error?: string };
      if (data.error !== undefined && data.error.length > 0) message = data.error;
    } catch {
      // keep generic message
    }
    throw new Error(message);
  }
  const data = JSON.parse(text) as { user: MeResponse["user"] };
  return data.user;
}

export async function postOnboarding(body: {
  orgName: string;
  teamName: string;
}): Promise<OnboardingResponse> {
  const res = await fetch("/api/onboarding", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Could not create organization");
  }
  return (await res.json()) as OnboardingResponse;
}

export async function postCreateTeam(orgId: string, name: string): Promise<CreateTeamResponse> {
  if (orgId.trim().length === 0) {
    throw new Error("Organization is not available yet.");
  }

  const res = await fetch(`/api/orgs/${encodeURIComponent(orgId)}/teams`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = `Could not create team (${res.status})`;
    try {
      const data = JSON.parse(text) as { error?: string };
      if (data.error !== undefined && data.error.length > 0) message = data.error;
    } catch {
      if (res.status === 405) {
        message = "Could not create team. Restart the dev server and try again.";
      }
    }
    throw new Error(message);
  }
  return JSON.parse(text) as CreateTeamResponse;
}

export async function mintTeamInvite(teamId: string): Promise<TeamInviteResponse> {
  const res = await fetch(`/api/teams/${encodeURIComponent(teamId)}/invites`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Could not create invite link");
  }
  return (await res.json()) as TeamInviteResponse;
}
