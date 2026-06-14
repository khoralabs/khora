export type MeTeam = {
  id: string;
  name: string;
  orgId: string;
  orgName: string;
};

export type MeResponse = {
  user: { id: string; registryUserId: string };
  teams: MeTeam[];
  onboardingRequired: boolean;
};

export type OnboardingResponse = {
  org: { id: string; name: string };
  team: { id: string; name: string; orgId: string };
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
