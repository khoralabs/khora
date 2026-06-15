import { useCallback, useEffect, useState } from "react";

import { InviteGate } from "@/components/auth/invite-gate";
import { JoinTeamGate } from "@/components/auth/join-team-gate";
import { SignIn } from "@/components/auth/sign-in";
import { Dashboard } from "@/components/dashboard/dashboard";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { SessionDetailView } from "@/components/sessions/session-detail";
import { SessionWizard } from "@/components/sessions/session-wizard";
import { Spinner } from "@/components/ui/spinner";
import { type AuthSessionResponse, fetchAuthSession } from "@/lib/auth-session";
import { fetchMe, type MeResponse } from "@/lib/me-api";

import "./index.css";

function parseInviteToken(pathname: string): string | null {
  const match = /^\/invite\/([^/]+)\/?$/.exec(pathname);
  return match?.[1] ?? null;
}

function parseJoinTeamToken(pathname: string): string | null {
  const match = /^\/join-team\/([^/]+)\/?$/.exec(pathname);
  return match?.[1] ?? null;
}

function isNewSessionPath(pathname: string): boolean {
  return /^\/sessions\/new\/?$/.test(pathname);
}

function parseSessionId(pathname: string): string | null {
  const match = /^\/sessions\/([^/]+)\/?$/.exec(pathname);
  if (match?.[1] === undefined || match[1] === "new") return null;
  return match[1];
}

function navigate(path: string) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function AppShell({
  session,
  me,
  pathname,
  onNavigate,
  onOnboardingComplete,
}: {
  session: AuthSessionResponse | null;
  me: MeResponse | null;
  pathname: string;
  onNavigate: (path: string) => void;
  onOnboardingComplete: () => void;
}) {
  if (session?.authenticated !== true) {
    return (
      <SignIn
        onSuccess={() => {
          window.location.reload();
        }}
      />
    );
  }

  if (me === null) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (me.onboardingRequired) {
    return <OnboardingWizard onComplete={onOnboardingComplete} />;
  }

  const team = me.teams[0];
  if (team === undefined) {
    return <p className="text-sm text-muted-foreground">No team found.</p>;
  }

  if (isNewSessionPath(pathname)) {
    return (
      <SessionWizard
        team={team}
        onCancel={() => onNavigate("/")}
        onCreated={(sessionId) => onNavigate(`/sessions/${sessionId}`)}
      />
    );
  }

  const sessionId = parseSessionId(pathname);
  if (sessionId !== null) {
    return <SessionDetailView sessionId={sessionId} onBack={() => onNavigate("/")} />;
  }

  return (
    <Dashboard
      team={team}
      onCreateSession={() => onNavigate("/sessions/new")}
      onSelectSession={(id) => onNavigate(`/sessions/${id}`)}
    />
  );
}

export function App() {
  const [pathname, setPathname] = useState(window.location.pathname);
  const inviteToken = parseInviteToken(pathname);
  const joinTeamToken = parseJoinTeamToken(pathname);
  const deepLinkToken = inviteToken ?? joinTeamToken;
  const [session, setSession] = useState<AuthSessionResponse | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(deepLinkToken === null);

  const handleNavigate = useCallback((path: string) => {
    navigate(path);
    setPathname(path);
  }, []);

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (deepLinkToken !== null) return;

    let cancelled = false;
    void fetchAuthSession().then(async (authSession) => {
      if (cancelled) return;
      setSession(authSession);
      if (authSession?.authenticated === true) {
        const profile = await fetchMe();
        if (!cancelled) setMe(profile);
      }
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [deepLinkToken]);

  function handleOnboardingComplete() {
    handleNavigate("/");
    void fetchMe().then((profile) => {
      if (profile !== null) setMe(profile);
    });
  }

  return (
    <div className="min-h-screen p-6">
      {inviteToken !== null ? (
        <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center">
          <InviteGate token={inviteToken} />
        </div>
      ) : joinTeamToken !== null ? (
        <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center">
          <JoinTeamGate token={joinTeamToken} />
        </div>
      ) : loading ? (
        <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center">
          <Spinner className="size-6" />
        </div>
      ) : me?.onboardingRequired === true ? (
        <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center">
          <AppShell
            session={session}
            me={me}
            pathname={pathname}
            onNavigate={handleNavigate}
            onOnboardingComplete={handleOnboardingComplete}
          />
        </div>
      ) : (
        <AppShell
          session={session}
          me={me}
          pathname={pathname}
          onNavigate={handleNavigate}
          onOnboardingComplete={handleOnboardingComplete}
        />
      )}
    </div>
  );
}

export default App;
