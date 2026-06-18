export const OrgPermission = {
  PermissionsManage: "permissions_manage",
  Write: "write",
  Read: "read",
  TeamManage: "team_manage",
  MemberManage: "member_manage",
} as const;

export type OrgPermission = (typeof OrgPermission)[keyof typeof OrgPermission];

export const ORG_PERMISSIONS = [
  OrgPermission.PermissionsManage,
  OrgPermission.Write,
  OrgPermission.Read,
  OrgPermission.TeamManage,
  OrgPermission.MemberManage,
] as const satisfies readonly OrgPermission[];

export const TeamPermission = {
  Write: "write",
  Read: "read",
  MemberManage: "member_manage",
} as const;

export type TeamPermission = (typeof TeamPermission)[keyof typeof TeamPermission];

export const TEAM_PERMISSIONS = [
  TeamPermission.Write,
  TeamPermission.Read,
  TeamPermission.MemberManage,
] as const satisfies readonly TeamPermission[];

export type OrgPermissionGrantTemplate = {
  resourceType: "org";
  resourceId: string;
  feature: OrgPermission;
};

export type TeamPermissionGrantTemplate = {
  resourceType: "team";
  resourceId: string;
  feature: TeamPermission;
};

export type PermissionGrantTemplate = OrgPermissionGrantTemplate | TeamPermissionGrantTemplate;

export const ORG_PERMISSION_META: Record<OrgPermission, { label: string; description: string }> = {
  [OrgPermission.PermissionsManage]: {
    label: "Permissions management",
    description: "Members of this team can manage permissions for teams and members",
  },
  [OrgPermission.Write]: {
    label: "Organization write",
    description: "Members of this team can edit organization settings and profile",
  },
  [OrgPermission.Read]: {
    label: "Organization read",
    description: "Members of this team can view organization settings and members",
  },
  [OrgPermission.TeamManage]: {
    label: "Team management",
    description: "Members of this team can create and delete teams in the organization",
  },
  [OrgPermission.MemberManage]: {
    label: "Member management",
    description: "Members of this team can add and remove organization members across teams",
  },
};

export const TEAM_PERMISSION_META: Record<TeamPermission, { label: string; description: string }> =
  {
    [TeamPermission.Write]: {
      label: "Team write",
      description: "Members of this team can edit team settings and profile",
    },
    [TeamPermission.Read]: {
      label: "Team read",
      description: "Members of this team can view team settings and members",
    },
    [TeamPermission.MemberManage]: {
      label: "Member management",
      description: "Members of this team can add and remove team members",
    },
  };

export function orgPermissionGrantTemplates(orgId: string): OrgPermissionGrantTemplate[] {
  return ORG_PERMISSIONS.map((feature) => ({
    resourceType: "org",
    resourceId: orgId,
    feature,
  }));
}

export function teamPermissionGrantTemplates(teamId: string): TeamPermissionGrantTemplate[] {
  return TEAM_PERMISSIONS.map((feature) => ({
    resourceType: "team",
    resourceId: teamId,
    feature,
  }));
}

export function orgPermissionsSnapshot(
  granted: readonly OrgPermission[],
): Record<OrgPermission, boolean> {
  const set = new Set(granted);
  return {
    [OrgPermission.PermissionsManage]: set.has(OrgPermission.PermissionsManage),
    [OrgPermission.Write]: set.has(OrgPermission.Write),
    [OrgPermission.Read]: set.has(OrgPermission.Read),
    [OrgPermission.TeamManage]: set.has(OrgPermission.TeamManage),
    [OrgPermission.MemberManage]: set.has(OrgPermission.MemberManage),
  };
}

export function teamPermissionsSnapshot(
  granted: readonly TeamPermission[],
): Record<TeamPermission, boolean> {
  const set = new Set(granted);
  return {
    [TeamPermission.Write]: set.has(TeamPermission.Write),
    [TeamPermission.Read]: set.has(TeamPermission.Read),
    [TeamPermission.MemberManage]: set.has(TeamPermission.MemberManage),
  };
}
