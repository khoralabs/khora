export type InterviewStatus = "not_started" | "started" | "complete";

/** Identity fields — same in every context. `userId` is the user's DID (a public identifier). */
export type AccountProfile = {
  userId: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  jobFunction: string | null;
};

export type SessionParticipantContext = {
  kind: "session_participant";
  sessionId: string;
  role: "facilitator" | "participant";
  interviewStatus: InterviewStatus;
};

export type TeamMemberContext = {
  kind: "team_member";
  teamId: string;
  isAdmin: boolean;
};

export type OrgMemberContext = {
  kind: "org_member";
  orgId: string;
  isAdmin: boolean;
  teamIds: string[];
  teamNames: string[];
};

export type AccountGrantContext = SessionParticipantContext | TeamMemberContext | OrgMemberContext;

export type AccountRow<TContext extends AccountGrantContext = AccountGrantContext> = {
  account: AccountProfile;
  isCurrentUser: boolean;
  context: TContext;
};
