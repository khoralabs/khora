import type { AccountRow, SessionParticipantContext } from "../accounts/row";
import type { TeamProfile } from "../teams/row";

export type SessionLinkAccess = "restricted" | "anyone";

export type SessionLinkGrantRole = "participant" | "facilitation";

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
  linkGrantRole: SessionLinkGrantRole;
  linkUrl: string | null;
  canManage: boolean;
  teamId: string;
  orgId: string;
  entries: SessionAccessEntry[];
};
