import type {
  AccountRow,
  InterviewStatus,
  SessionParticipantContext,
  TeamMemberContext,
} from "@shared/accounts/row";

export type SessionSummary = {
  id: string;
  teamId: string;
  topic: string;
  deadlineMs: number | null;
  status: string;
  createdAtMs: number;
  role: "facilitator" | "participant";
};

export type SessionPhase = "individual" | "synthesis" | "alignment" | "closed";

export type { InterviewStatus };

export type SessionParticipantRow = AccountRow<SessionParticipantContext>;
export type TeamMemberRow = AccountRow<TeamMemberContext>;

export type SessionDetail = {
  session: SessionSummary & {
    phase: SessionPhase;
    daysToDeadline: string | null;
  };
  participants: SessionParticipantRow[];
  canManage: boolean;
};

export type CreateSessionInput = {
  teamId: string;
  topic: string;
  deadlineMs?: number;
  memberUserIds?: string[];
  teamIds?: string[];
  createInvite?: boolean;
};

export type CreateSessionResult = {
  session: SessionSummary;
  inviteUrl?: string;
};

export type ManageSessionScopesInput = {
  add?: { accountIds?: string[]; teamIds?: string[] };
  remove?: { accountIds?: string[]; teamIds?: string[] };
};

export async function fetchSessions(teamId?: string): Promise<SessionSummary[]> {
  const query = teamId !== undefined ? `?teamId=${encodeURIComponent(teamId)}` : "";
  const res = await fetch(`/api/sessions${query}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load sessions");
  const body = (await res.json()) as { sessions: SessionSummary[] };
  return body.sessions;
}

export async function createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
  const res = await fetch("/api/sessions", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Failed to create session");
  }
  const body = (await res.json()) as CreateSessionResult;
  return {
    session: body.session,
    inviteUrl:
      body.inviteUrl !== undefined
        ? new URL(body.inviteUrl, window.location.origin).href
        : undefined,
  };
}

export async function patchSession(
  sessionId: string,
  input: { topic?: string; deadlineMs?: number | null },
): Promise<SessionSummary> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Failed to update session");
  }
  const body = (await res.json()) as { session: SessionSummary };
  return body.session;
}

export async function manageSessionScopes(
  sessionId: string,
  input: ManageSessionScopesInput,
): Promise<SessionParticipantRow[]> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/scopes`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Failed to update session access");
  }
  const body = (await res.json()) as { participants: SessionParticipantRow[] };
  return body.participants;
}

export async function fetchTeamMembers(teamId: string): Promise<TeamMemberRow[]> {
  const res = await fetch(`/api/teams/${encodeURIComponent(teamId)}/members`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to load team members");
  const body = (await res.json()) as { members: TeamMemberRow[] };
  return body.members;
}

export function formatSessionDate(ms: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ms));
}

export function formatPhaseLabel(phase: SessionPhase): string {
  switch (phase) {
    case "individual":
      return "Individual interviews";
    case "synthesis":
      return "Synthesis";
    case "alignment":
      return "Group alignment";
    case "closed":
      return "Closed";
  }
}

export function formatInterviewStatus(status: InterviewStatus): string {
  switch (status) {
    case "not_started":
      return "Not started";
    case "started":
      return "Started";
    case "complete":
      return "Complete";
  }
}

export async function fetchSessionDetail(sessionId: string): Promise<SessionDetail> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    credentials: "include",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Failed to load session");
  }
  return (await res.json()) as SessionDetail;
}

export async function mintSessionInvite(
  sessionId: string,
): Promise<{ token: string; url: string }> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/invites`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Failed to create invite link");
  }
  const body = (await res.json()) as { token: string; url: string };
  return {
    token: body.token,
    url: new URL(body.url, window.location.origin).href,
  };
}
