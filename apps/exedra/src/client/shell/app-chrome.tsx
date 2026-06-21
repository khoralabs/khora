import { type ReactNode, useCallback, useEffect, useState } from "react";
import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { ConsentForm } from "@/components/auth/consent-form";
import { SignIn } from "@/components/auth/sign-in";
import { OnboardingDialog } from "@/components/onboarding/onboarding-dialog";
import { CreateTeamDialog } from "@/components/teams/create-team-dialog";
import { Toaster } from "@/components/ui/sonner";
import { Spinner } from "@/components/ui/spinner";
import { AnalyticsProvider } from "@/lib/analytics";
import { type AuthSessionResponse, fetchAuthSession, signOutAuthSession } from "@/lib/auth-session";
import {
  fetchMe,
  listOrgsFromTeams,
  type MeResponse,
  type MeTeam,
  ONBOARDING_PLACEHOLDER_ORG,
  ONBOARDING_PLACEHOLDER_TEAM,
  type OrgSummary,
  submitConsent,
  teamsForOrg,
} from "@/lib/me-api";
import {
  fetchSessionDetail,
  fetchSessions,
  type SessionDetail,
  type SessionSummary,
} from "@/lib/sessions-api";
import { track } from "@/lib/telemetry";

import { readActiveSelection, writeActiveSelection } from "./active-selection";
import { AppSidebar } from "./app-sidebar";
import { MobileChromeLayoutProvider } from "./mobile-chrome-layout";
import { type ExedraEntrypoint, entrypointForPath, navigateExedra } from "./navigation";
import {
  isSettingsPath,
  onboardingInterviewPath,
  parseActiveSessionId,
  settingsAccountPath,
  settingsOrgPath,
} from "./routes";
import { SidebarChromeProvider } from "./sidebar-chrome-context";

export type AppChromeContext = {
  me: MeResponse;
  pathname: string;
  onNavigate: (path: string) => void;
  activeTeam: MeTeam;
  activeOrg: OrgSummary;
  orgs: OrgSummary[];
  sessions: SessionSummary[] | null;
  sessionDetail: SessionDetail | null;
  loadSessions: () => void;
  loadSessionDetail: (sessionId: string) => void;
  onProfileRefresh: () => void;
};

type AppChromeProps = {
  entrypoint: ExedraEntrypoint;
  children: (ctx: AppChromeContext) => ReactNode;
};

export function AppChrome({ entrypoint, children }: AppChromeProps) {
  return (
    <MobileChromeLayoutProvider>
      <AppChromeInner entrypoint={entrypoint}>{children}</AppChromeInner>
    </MobileChromeLayoutProvider>
  );
}

function AppChromeInner({ entrypoint, children }: AppChromeProps) {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [session, setSession] = useState<AuthSessionResponse | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [activeTeam, setActiveTeam] = useState<MeTeam>(ONBOARDING_PLACEHOLDER_TEAM);
  const [activeOrg, setActiveOrg] = useState<OrgSummary>(ONBOARDING_PLACEHOLDER_ORG);
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [sessionDetail, setSessionDetail] = useState<SessionDetail | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [consentSubmitting, setConsentSubmitting] = useState(false);

  const onboardingRequired = me?.onboardingRequired ?? false;
  const hasSessionAccessOnly = me?.hasSessionAccessOnly ?? false;
  const onboardingInterviewRequired = me?.onboardingInterviewRequired ?? false;
  const onboardingSessionId = me?.onboardingSessionId ?? null;
  const createSessionDisabled = onboardingRequired || onboardingInterviewRequired;
  const activeSessionId = parseActiveSessionId(pathname);
  const settingsMode = isSettingsPath(pathname);

  const onNavigate = useCallback(
    (path: string) => {
      navigateExedra(path, entrypoint);
      if (entrypointForPath(path) === entrypoint) {
        setPathname(path);
      }
    },
    [entrypoint],
  );

  const loadSessions = useCallback(() => {
    if (activeTeam.id.length === 0 && !hasSessionAccessOnly) return;
    const teamId = activeTeam.id.length > 0 ? activeTeam.id : undefined;
    void fetchSessions(teamId)
      .then(setSessions)
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : "Failed to load sessions");
      });
  }, [activeTeam.id, hasSessionAccessOnly]);

  const loadSessionDetail = useCallback((sessionId: string) => {
    void fetchSessionDetail(sessionId)
      .then(setSessionDetail)
      .catch(() => setSessionDetail(null));
  }, []);

  const applyProfileSelection = useCallback((profile: MeResponse) => {
    if (profile.teams.length === 0) return;
    const orgs = listOrgsFromTeams(profile.teams);
    const saved = readActiveSelection();

    const restoredOrg = orgs.find((o) => o.id === saved.orgId) ?? orgs[0];
    if (restoredOrg === undefined) return;

    const orgTeams = teamsForOrg(profile.teams, restoredOrg.id);
    const restoredTeam = orgTeams.find((t) => t.id === saved.teamId) ?? orgTeams[0];
    if (restoredTeam === undefined) return;

    setActiveOrg(restoredOrg);
    setActiveTeam(restoredTeam);
  }, []);

  const onProfileRefresh = useCallback(() => {
    void fetchMe().then((profile) => {
      if (profile !== null) {
        setMe(profile);
        applyProfileSelection(profile);
      }
    });
  }, [applyProfileSelection]);

  const onOnboardingComplete = useCallback((sessionId: string) => {
    window.location.href = onboardingInterviewPath(sessionId);
  }, []);

  const onSignOut = useCallback(async () => {
    await signOutAuthSession();
    window.location.href = "/";
  }, []);

  const handleConsentAccept = useCallback(
    async (opts: { marketing: boolean }) => {
      if (me === null) return;
      setConsentSubmitting(true);
      try {
        const result = await submitConsent(opts);
        setMe({
          ...me,
          termsAcceptedAtMs: result.termsAcceptedAtMs,
          marketingOptedInAtMs: result.marketingOptedInAtMs ?? me.marketingOptedInAtMs,
        });
        track("terms_accepted", {
          orgId: activeOrg.id.length > 0 ? activeOrg.id : undefined,
          marketingOptIn: opts.marketing,
        });
      } finally {
        setConsentSubmitting(false);
      }
    },
    [me, activeOrg.id],
  );

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const authSession = await fetchAuthSession();
        if (cancelled) return;
        setSession(authSession);
        if (authSession?.authenticated === true) {
          try {
            const profile = await fetchMe();
            if (!cancelled && profile !== null) {
              setMe(profile);
              applyProfileSelection(profile);
            }
          } catch {
            // Profile load failed — fall through to sign-in.
          }
        }
      } catch {
        // Session check failed — fall through to sign-in.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyProfileSelection]);

  useEffect(() => {
    if (me === null) return;
    loadSessions();
  }, [me, loadSessions]);

  useEffect(() => {
    if (me === null) return;
    if (me.teams.length === 0) {
      setActiveTeam(ONBOARDING_PLACEHOLDER_TEAM);
      setActiveOrg(ONBOARDING_PLACEHOLDER_ORG);
      return;
    }
    const stillMember = me.teams.some((team) => team.id === activeTeam.id);
    if (!stillMember) {
      const fallback = teamsForOrg(me.teams, activeOrg.id)[0] ?? me.teams[0];
      if (fallback !== undefined) setActiveTeam(fallback);
    }
  }, [me, activeTeam.id, activeOrg.id]);

  useEffect(() => {
    if (activeSessionId === null) {
      setSessionDetail(null);
      return;
    }
    loadSessionDetail(activeSessionId);
  }, [activeSessionId, loadSessionDetail]);

  useEffect(() => {
    if (me === null) return;
    if (onboardingRequired) return;
    if (!onboardingInterviewRequired || onboardingSessionId === null) return;
    if (pathname !== "/") return;
    window.location.href = onboardingInterviewPath(onboardingSessionId);
  }, [me, onboardingRequired, onboardingInterviewRequired, onboardingSessionId, pathname]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (session?.authenticated !== true || me === null) {
    return <SignIn onSuccess={() => window.location.reload()} />;
  }

  function handleSelectSession(sessionId: string) {
    onNavigate(`/sessions/${sessionId}/interview`);
  }

  if (me.termsAcceptedAtMs === null) {
    return (
      <AuthPageShell>
        <ConsentForm onAccept={handleConsentAccept} submitting={consentSubmitting} />
      </AuthPageShell>
    );
  }

  const orgs = listOrgsFromTeams(me.teams);
  const teamsForActiveOrg = teamsForOrg(me.teams, activeOrg.id);

  const onOrgChange = (org: OrgSummary) => {
    const firstTeam = teamsForOrg(me.teams, org.id)[0];
    setActiveOrg(org);
    if (firstTeam !== undefined) {
      setActiveTeam(firstTeam);
      writeActiveSelection(org.id, firstTeam.id);
    }
    onNavigate("/");
  };

  const sidebarProps = {
    me,
    teams: teamsForActiveOrg,
    activeTeam,
    activeOrg,
    orgs,
    sessions,
    activeSessionId,
    pathname,
    collapsed: sidebarCollapsed,
    createSessionDisabled,
    onTeamChange: (team: MeTeam) => {
      setActiveTeam(team);
      setActiveOrg({ id: team.orgId, name: team.orgName, avatarUrl: team.orgAvatarUrl });
      writeActiveSelection(team.orgId, team.id);
      onNavigate("/");
    },
    onOrgChange,
    onCreateSession: () => {
      if (createSessionDisabled) return;
      onNavigate("/sessions/new");
    },
    onCreateTeam: () => setCreateTeamOpen(true),
    onManageTeams: () => onNavigate(settingsOrgPath("teams")),
    onSelectSession: handleSelectSession,
    onOpenOrgSettings: () => onNavigate(settingsOrgPath("general")),
    onOpenProfileSettings: () => onNavigate(settingsAccountPath()),
    onSignOut: () => void onSignOut(),
    settingsMode,
    onNavigate,
  };

  return (
    <AnalyticsProvider orgId={activeOrg.id.length > 0 ? activeOrg.id : undefined}>
      <SidebarChromeProvider
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
      >
        <div className="flex h-screen overflow-hidden">
          <AppSidebar {...sidebarProps} />

          {children({
            me,
            pathname,
            onNavigate,
            activeTeam,
            activeOrg,
            orgs,
            sessions,
            sessionDetail,
            loadSessions,
            loadSessionDetail,
            onProfileRefresh,
          })}

          {loadError !== null ? (
            <p className="absolute bottom-4 left-4 text-sm text-destructive">{loadError}</p>
          ) : null}

          <OnboardingDialog
            open={onboardingRequired && !hasSessionAccessOnly}
            onComplete={onOnboardingComplete}
          />

          <CreateTeamDialog
            open={createTeamOpen}
            org={activeTeam}
            onOpenChange={setCreateTeamOpen}
            onCreated={(team) => {
              onProfileRefresh();
              setActiveTeam(team);
              onNavigate("/");
            }}
          />

          <Toaster />
        </div>
      </SidebarChromeProvider>
    </AnalyticsProvider>
  );
}
