import { type ReactNode, useCallback, useEffect, useState } from "react";
import { SignIn } from "@/components/auth/sign-in";
import { SessionSidebar } from "@/components/exedra/session-sidebar";
import { OnboardingDialog } from "@/components/onboarding/onboarding-dialog";
import { CreateTeamDialog } from "@/components/teams/create-team-dialog";
import { Spinner } from "@/components/ui/spinner";
import { type AuthSessionResponse, fetchAuthSession, signOutAuthSession } from "@/lib/auth-session";
import { fetchMe, type MeResponse, type MeTeam, ONBOARDING_PLACEHOLDER_TEAM } from "@/lib/me-api";
import {
  fetchSessionDetail,
  fetchSessions,
  type SessionDetail,
  type SessionSummary,
} from "@/lib/sessions-api";

import { type ExedraEntrypoint, entrypointForPath, navigateExedra } from "./navigation";
import { isSessionInterviewPath, isSettingsPath, parseActiveSessionId } from "./routes";

export type AppChromeContext = {
  me: MeResponse;
  pathname: string;
  onNavigate: (path: string) => void;
  activeTeam: MeTeam;
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
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [session, setSession] = useState<AuthSessionResponse | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [activeTeam, setActiveTeam] = useState<MeTeam>(ONBOARDING_PLACEHOLDER_TEAM);
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [sessionDetail, setSessionDetail] = useState<SessionDetail | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const onboardingRequired = me?.onboardingRequired ?? false;
  const onboardingInterviewRequired = me?.onboardingInterviewRequired ?? false;
  const onboardingSessionId = me?.onboardingSessionId ?? null;
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
    if (activeTeam.id.length === 0) return;
    void fetchSessions(activeTeam.id)
      .then(setSessions)
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : "Failed to load sessions");
      });
  }, [activeTeam.id]);

  const loadSessionDetail = useCallback((sessionId: string) => {
    void fetchSessionDetail(sessionId)
      .then(setSessionDetail)
      .catch(() => setSessionDetail(null));
  }, []);

  const onProfileRefresh = useCallback(() => {
    void fetchMe().then((profile) => {
      if (profile !== null) setMe(profile);
    });
  }, []);

  const onOnboardingComplete = useCallback(
    (sessionId: string) => {
      onProfileRefresh();
      window.location.href = `/sessions/${sessionId}/interview`;
    },
    [onProfileRefresh],
  );

  const onSignOut = useCallback(async () => {
    await signOutAuthSession();
    window.location.href = "/";
  }, []);

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
              setActiveTeam(profile.teams[0] ?? ONBOARDING_PLACEHOLDER_TEAM);
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
  }, []);

  useEffect(() => {
    if (me === null) return;
    loadSessions();
  }, [me, loadSessions]);

  useEffect(() => {
    if (me === null) return;
    if (me.teams.length === 0) {
      setActiveTeam(ONBOARDING_PLACEHOLDER_TEAM);
      return;
    }
    const stillMember = me.teams.some((team) => team.id === activeTeam.id);
    if (!stillMember && me.teams[0] !== undefined) {
      setActiveTeam(me.teams[0]);
    }
  }, [me, activeTeam.id]);

  useEffect(() => {
    if (activeSessionId === null) {
      setSessionDetail(null);
      return;
    }
    loadSessionDetail(activeSessionId);
  }, [activeSessionId, loadSessionDetail]);

  useEffect(() => {
    if (me === null) return;
    if (onboardingRequired || !onboardingInterviewRequired || onboardingSessionId === null) return;
    const onOnboardingInterview =
      activeSessionId === onboardingSessionId && isSessionInterviewPath(pathname);
    if (onOnboardingInterview) return;
    window.location.href = `/sessions/${onboardingSessionId}/interview`;
  }, [
    me,
    onboardingRequired,
    onboardingInterviewRequired,
    onboardingSessionId,
    activeSessionId,
    pathname,
  ]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (session?.authenticated !== true || me === null) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <SignIn onSuccess={() => window.location.reload()} />
      </div>
    );
  }

  function handleSelectSession(sessionId: string) {
    onNavigate(`/sessions/${sessionId}/interview`);
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <SessionSidebar
        me={me}
        teams={me.teams}
        activeTeam={activeTeam}
        sessions={sessions}
        activeSessionId={activeSessionId}
        pathname={pathname}
        collapsed={sidebarCollapsed}
        onboardingRequired={onboardingRequired || onboardingInterviewRequired}
        onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
        onTeamChange={(team) => {
          setActiveTeam(team);
          onNavigate("/");
        }}
        onCreateSession={() => {
          if (onboardingRequired || onboardingInterviewRequired) return;
          onNavigate("/sessions/new");
        }}
        onCreateTeam={() => setCreateTeamOpen(true)}
        onSelectSession={handleSelectSession}
        onOpenTeamGraph={() => onNavigate(`/teams/${activeTeam.id}/graph`)}
        onOpenPersonalGraph={() => onNavigate("/me/graph")}
        onOpenSettings={() => onNavigate("/settings/account")}
        onSignOut={() => void onSignOut()}
        settingsMode={settingsMode}
        onNavigate={onNavigate}
      />

      {children({
        me,
        pathname,
        onNavigate,
        activeTeam,
        sessions,
        sessionDetail,
        loadSessions,
        loadSessionDetail,
        onProfileRefresh,
      })}

      {loadError !== null ? (
        <p className="absolute bottom-4 left-4 text-sm text-destructive">{loadError}</p>
      ) : null}

      <OnboardingDialog open={onboardingRequired} onComplete={onOnboardingComplete} />

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
    </div>
  );
}
