import type { AccountProfile } from "@shared/accounts/row";
import type { TeamProfile } from "@shared/teams/row";

export type MeTeam = TeamProfile;

export type OrgSummary = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

export const ONBOARDING_PLACEHOLDER_ORG: OrgSummary = {
  id: "",
  name: "Your organization",
  avatarUrl: null,
};

/** Derives unique orgs from a team list, preserving first-seen order. */
export function listOrgsFromTeams(teams: MeTeam[]): OrgSummary[] {
  const seen = new Set<string>();
  const orgs: OrgSummary[] = [];
  for (const team of teams) {
    if (!seen.has(team.orgId)) {
      seen.add(team.orgId);
      orgs.push({ id: team.orgId, name: team.orgName, avatarUrl: team.orgAvatarUrl });
    }
  }
  return orgs;
}

/** Returns teams belonging to a specific org. */
export function teamsForOrg(teams: MeTeam[], orgId: string): MeTeam[] {
  return teams.filter((t) => t.orgId === orgId);
}

export type MeResponse = {
  user: AccountProfile;
  teams: MeTeam[];
  onboardingRequired: boolean;
  onboardingInterviewRequired: boolean;
  onboardingSessionId: string | null;
  hasSessionAccessOnly: boolean;
  termsAcceptedAtMs: number | null;
  networkOptedInAtMs: number | null;
  marketingOptedInAtMs: number | null;
  networkJoinAvailable: boolean;
};

export const ONBOARDING_PLACEHOLDER_TEAM: MeTeam = {
  id: "",
  name: "Your team",
  orgId: "",
  orgName: "Your organization",
  avatarUrl: null,
  orgAvatarUrl: null,
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
}): Promise<AccountProfile> {
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
  const data = JSON.parse(text) as { user: AccountProfile };
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

export async function acceptTerms(): Promise<{ termsAcceptedAtMs: number }> {
  const res = await fetch("/api/me/terms-accept", {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(await res.text().catch(() => "Could not accept terms"));
  }
  return (await res.json()) as { termsAcceptedAtMs: number };
}

export async function joinMyNetwork(): Promise<{ networkOptedInAtMs: number }> {
  const res = await fetch("/api/me/join-network", {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Could not join Khora network");
  }
  return (await res.json()) as { networkOptedInAtMs: number };
}

export async function marketingOptIn(): Promise<{ marketingOptedInAtMs: number }> {
  const res = await fetch("/api/me/marketing-opt-in", {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(await res.text().catch(() => "Could not opt in to marketing"));
  }
  return (await res.json()) as { marketingOptedInAtMs: number };
}

export async function submitConsent(opts: { marketing: boolean }): Promise<{
  termsAcceptedAtMs: number;
  marketingOptedInAtMs: number | null;
}> {
  const { termsAcceptedAtMs } = await acceptTerms();
  let marketingOptedInAtMs: number | null = null;
  if (opts.marketing) {
    const result = await marketingOptIn();
    marketingOptedInAtMs = result.marketingOptedInAtMs;
  }
  return { termsAcceptedAtMs, marketingOptedInAtMs };
}
