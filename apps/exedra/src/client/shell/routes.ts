export function parseActiveSessionId(pathname: string): string | null {
  const interviewMatch = /^\/sessions\/([^/]+)\/interview\/?$/.exec(pathname);
  if (interviewMatch?.[1] !== undefined) return interviewMatch[1];

  const graphMatch = /^\/sessions\/([^/]+)\/graph\/?$/.exec(pathname);
  if (graphMatch?.[1] !== undefined) return graphMatch[1];

  const sessionMatch = /^\/sessions\/([^/]+)\/?$/.exec(pathname);
  if (sessionMatch?.[1] !== undefined && sessionMatch[1] !== "new") return sessionMatch[1];

  return null;
}

export function parseInterviewSessionId(pathname: string): string | null {
  const match = /^\/sessions\/([^/]+)\/interview\/?$/.exec(pathname);
  return match?.[1] ?? null;
}

export function parseSessionGraphId(pathname: string): string | null {
  const match = /^\/sessions\/([^/]+)\/graph\/?$/.exec(pathname);
  return match?.[1] ?? null;
}

export function parseActiveTeamGraphId(pathname: string): string | null {
  const match = /^\/teams\/([^/]+)\/graph\/?$/.exec(pathname);
  return match?.[1] ?? null;
}

export function isPersonalGraphPath(pathname: string): boolean {
  return /^\/me\/graph\/?$/.test(pathname);
}

export function isNewSessionPath(pathname: string): boolean {
  return /^\/sessions\/new\/?$/.test(pathname);
}

export function isSessionInterviewPath(pathname: string): boolean {
  return /^\/sessions\/([^/]+)\/interview\/?$/.test(pathname);
}

export type SettingsScope = "account" | "organization";

export const ACCOUNT_AREAS = ["profile", "preferences", "notifications"] as const;
export type AccountArea = (typeof ACCOUNT_AREAS)[number];

export const ORG_AREAS = [
  "general",
  "members",
  "teams",
  "access",
  "billing",
  "usage",
  "models",
] as const;
export type OrgArea = (typeof ORG_AREAS)[number];

export const TEAM_SUB_AREAS = ["general", "members", "permissions"] as const;
export type TeamSubArea = (typeof TEAM_SUB_AREAS)[number];

export type SettingsRoute = {
  scope: SettingsScope;
  /** AccountArea when scope is "account"; OrgArea when scope is "organization". */
  area: AccountArea | OrgArea;
  /** Present for the organization members detail route. */
  userId?: string;
  /** Present for the organization teams detail route. */
  teamId?: string;
  /** Sub-area within a team detail route. */
  teamSubArea?: TeamSubArea;
};

export function isSettingsPath(pathname: string): boolean {
  return /^\/settings(\/|$)/.test(pathname);
}

function isOrgArea(value: string): value is OrgArea {
  return (ORG_AREAS as readonly string[]).includes(value);
}

function isAccountArea(value: string): value is AccountArea {
  return (ACCOUNT_AREAS as readonly string[]).includes(value);
}

function isTeamSubArea(value: string): value is TeamSubArea {
  return (TEAM_SUB_AREAS as readonly string[]).includes(value);
}

const ACCOUNT_ROUTE: SettingsRoute = { scope: "account", area: "profile" };

/** Parse a `/settings/*` pathname into a structured route. Falls back to the account profile. */
export function parseSettingsRoute(pathname: string): SettingsRoute {
  const trimmed = pathname.replace(/\/+$/, "");
  const segments = trimmed.split("/").filter(Boolean);
  // segments[0] === "settings"
  const scope = segments[1];

  if (scope === "organization") {
    const area = segments[2];
    if (area === undefined) return { scope: "organization", area: "general" };
    if (!isOrgArea(area)) return { scope: "organization", area: "general" };

    if (area === "members") {
      const userId = segments[3];
      return userId !== undefined
        ? { scope: "organization", area: "members", userId: decodeURIComponent(userId) }
        : { scope: "organization", area: "members" };
    }

    if (area === "teams") {
      const teamId = segments[3];
      if (teamId === undefined) return { scope: "organization", area: "teams" };
      const sub = segments[4];
      const teamSubArea = sub !== undefined && isTeamSubArea(sub) ? sub : "general";
      return {
        scope: "organization",
        area: "teams",
        teamId: decodeURIComponent(teamId),
        teamSubArea,
      };
    }

    return { scope: "organization", area };
  }

  if (scope === "account") {
    const area = segments[2];
    if (area !== undefined && isAccountArea(area)) {
      return { scope: "account", area };
    }
    return ACCOUNT_ROUTE;
  }

  return ACCOUNT_ROUTE;
}

export function settingsAccountPath(area: AccountArea = "profile"): string {
  return area === "profile" ? "/settings/account" : `/settings/account/${area}`;
}

export function settingsOrgPath(area: OrgArea = "general"): string {
  return `/settings/organization/${area}`;
}

export function settingsMemberPath(userId: string): string {
  return `/settings/organization/members/${encodeURIComponent(userId)}`;
}

export function settingsTeamPath(teamId: string, subArea: TeamSubArea = "general"): string {
  const base = `/settings/organization/teams/${encodeURIComponent(teamId)}`;
  return subArea === "general" ? base : `${base}/${subArea}`;
}

/**
 * Map legacy/ambiguous settings paths to their canonical location.
 * Returns null when the path is already canonical.
 */
export function settingsRedirectFor(pathname: string): string | null {
  if (pathname === "/settings" || pathname === "/settings/") {
    return settingsAccountPath();
  }
  if (/^\/settings\/organization\/?$/.test(pathname)) {
    return settingsOrgPath("general");
  }
  const legacyTeam = /^\/settings\/team\/([^/]+)\/?$/.exec(pathname);
  if (legacyTeam?.[1] !== undefined) {
    return settingsTeamPath(decodeURIComponent(legacyTeam[1]));
  }
  const legacyMember = /^\/settings\/account\/([^/]+)\/?$/.exec(pathname);
  if (legacyMember?.[1] !== undefined && !isAccountArea(legacyMember[1])) {
    return settingsMemberPath(decodeURIComponent(legacyMember[1]));
  }
  return null;
}

export type SettingsBreadcrumb = { label: string; path?: string };

const ORG_AREA_LABELS: Record<OrgArea, string> = {
  general: "General",
  members: "Members",
  teams: "Teams",
  access: "Access",
  billing: "Billing",
  usage: "Usage",
  models: "Models",
};

const ACCOUNT_AREA_LABELS: Record<AccountArea, string> = {
  profile: "Profile",
  preferences: "Preferences",
  notifications: "Notifications",
};

const TEAM_SUB_AREA_LABELS: Record<TeamSubArea, string> = {
  general: "General",
  members: "Members",
  permissions: "Permissions",
};

/** Build the breadcrumb trail for a settings route. */
export function settingsBreadcrumbs(
  route: SettingsRoute,
  ctx: { orgName?: string; teamName?: string; memberName?: string } = {},
): SettingsBreadcrumb[] {
  if (route.scope === "account") {
    const area = route.area as AccountArea;
    const crumbs: SettingsBreadcrumb[] = [
      { label: "Account", path: area === "profile" ? undefined : settingsAccountPath() },
    ];
    if (area !== "profile") crumbs.push({ label: ACCOUNT_AREA_LABELS[area] });
    return crumbs;
  }

  const area = route.area as OrgArea;
  const orgLabel =
    ctx.orgName !== undefined && ctx.orgName.length > 0 ? ctx.orgName : "Organization";
  const crumbs: SettingsBreadcrumb[] = [{ label: orgLabel, path: settingsOrgPath("general") }];

  if (area === "teams" && route.teamId !== undefined) {
    crumbs.push({ label: "Teams", path: settingsOrgPath("teams") });
    const teamLabel = ctx.teamName !== undefined && ctx.teamName.length > 0 ? ctx.teamName : "Team";
    const sub = route.teamSubArea ?? "general";
    crumbs.push({
      label: teamLabel,
      path: sub === "general" ? undefined : settingsTeamPath(route.teamId),
    });
    if (sub !== "general") crumbs.push({ label: TEAM_SUB_AREA_LABELS[sub] });
    return crumbs;
  }

  if (area === "members" && route.userId !== undefined) {
    crumbs.push({ label: "Members", path: settingsOrgPath("members") });
    crumbs.push({
      label: ctx.memberName !== undefined && ctx.memberName.length > 0 ? ctx.memberName : "Member",
    });
    return crumbs;
  }

  crumbs.push({ label: ORG_AREA_LABELS[area] });
  return crumbs;
}

export function onboardingInterviewPath(sessionId: string): string {
  return `/sessions/${sessionId}/interview`;
}
