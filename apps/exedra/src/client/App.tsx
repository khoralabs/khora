import { useCallback, useEffect, useState } from "react";

import { InviteGate } from "@/components/auth/invite-gate";
import { JoinTeamGate } from "@/components/auth/join-team-gate";
import { SignIn } from "@/components/auth/sign-in";
import { ExedraShell } from "@/components/exedra/exedra-shell";
import { Spinner } from "@/components/ui/spinner";
import { type AuthSessionResponse, fetchAuthSession, signOutAuthSession } from "@/lib/auth-session";
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

function normalizePathname(pathname: string): string {
  const sessionMatch = /^\/sessions\/([^/]+)\/?$/.exec(pathname);
  if (sessionMatch?.[1] !== undefined && sessionMatch[1] !== "new") {
    return `/sessions/${sessionMatch[1]}/interview`;
  }
  return pathname;
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
  onProfileRefresh,
  onSignOut,
}: {
  session: AuthSessionResponse | null;
  me: MeResponse | null;
  pathname: string;
  onNavigate: (path: string) => void;
  onOnboardingComplete: (sessionId: string) => void;
  onProfileRefresh: () => void;
  onSignOut: () => void;
}) {
  if (session?.authenticated !== true) {
    return (
      <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center">
        <SignIn
          onSuccess={() => {
            window.location.reload();
          }}
        />
      </div>
    );
  }

  if (me === null) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  return (
    <ExedraShell
      me={me}
      pathname={pathname}
      onNavigate={onNavigate}
      onSignOut={onSignOut}
      onOnboardingComplete={onOnboardingComplete}
      onProfileRefresh={onProfileRefresh}
    />
  );
}

export function App() {
  const [pathname, setPathname] = useState(() => normalizePathname(window.location.pathname));
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
    const normalized = normalizePathname(window.location.pathname);
    if (normalized !== window.location.pathname) {
      window.history.replaceState(null, "", normalized);
      setPathname(normalized);
    }
  }, []);

  useEffect(() => {
    const onPopState = () => setPathname(normalizePathname(window.location.pathname));
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

  function handleProfileRefresh() {
    void fetchMe().then((profile) => {
      if (profile !== null) setMe(profile);
    });
  }

  function handleOnboardingComplete(sessionId: string) {
    handleProfileRefresh();
    handleNavigate(`/sessions/${sessionId}/interview`);
  }

  async function handleSignOut() {
    await signOutAuthSession();
    setSession({ authenticated: false });
    setMe(null);
    handleNavigate("/");
  }

  const isExedraShell = deepLinkToken === null && !loading && session?.authenticated === true;

  return (
    <div className={isExedraShell ? "h-screen" : "min-h-screen p-6"}>
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
      ) : (
        <AppShell
          session={session}
          me={me}
          pathname={pathname}
          onNavigate={handleNavigate}
          onOnboardingComplete={handleOnboardingComplete}
          onProfileRefresh={handleProfileRefresh}
          onSignOut={() => void handleSignOut()}
        />
      )}
    </div>
  );
}

export default App;
