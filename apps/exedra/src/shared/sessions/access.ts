import type { AccountRow, SessionParticipantContext } from "../accounts/row";
import type { TeamProfile } from "../teams/row";

export type SessionLinkAccess = "restricted" | "anyone";

export type SessionAccountEntry = {
  kind: "account";
} & AccountRow<SessionParticipantContext>;

export type SessionTeamEntry = {
  kind: "team";
  team: TeamProfile;
  role: "participant" | "facilitator";
};

export type SessionAccessEntry = SessionAccountEntry | SessionTeamEntry;

export type SessionAccess = {
  linkAccess: SessionLinkAccess;
  linkUrl: string | null;
  canManage: boolean;
  teamId: string;
  orgId: string;
  entries: SessionAccessEntry[];
};
