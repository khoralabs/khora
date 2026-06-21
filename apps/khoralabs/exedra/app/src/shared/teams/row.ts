export type TeamProfile = {
  id: string;
  name: string;
  avatarUrl: string | null;
  orgId: string;
  orgName: string;
  orgAvatarUrl: string | null;
};

export type OrgTeamContext = {
  kind: "org_team";
  memberCount: number;
};

export type TeamGrantContext = OrgTeamContext;

export type TeamRow<TContext extends TeamGrantContext = TeamGrantContext> = {
  team: TeamProfile;
  context: TContext;
};
