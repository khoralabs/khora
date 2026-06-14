import { useEffect, useState } from "react";

import { InviteGate } from "@/components/auth/invite-gate";
import { JoinTeamGate } from "@/components/auth/join-team-gate";
import { SignIn } from "@/components/auth/sign-in";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type AuthSessionResponse, fetchAuthSession } from "@/lib/auth-session";
import { fetchMe, type MeResponse, type MeTeam } from "@/lib/me-api";

import "./index.css";

function parseInviteToken(pathname: string): string | null {
  const match = /^\/invite\/([^/]+)\/?$/.exec(pathname);
  return match?.[1] ?? null;
}

function parseJoinTeamToken(pathname: string): string | null {
  const match = /^\/join-team\/([^/]+)\/?$/.exec(pathname);
  return match?.[1] ?? null;
}

function Home({
  session,
  me,
  onOnboardingComplete,
}: {
  session: AuthSessionResponse | null;
  me: MeResponse | null;
  onOnboardingComplete: (team: MeTeam) => void;
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
    return <p className="text-sm text-muted-foreground">Loading profile…</p>;
  }

  if (me.onboardingRequired) {
    return <OnboardingWizard onComplete={onOnboardingComplete} />;
  }

  const primaryTeam = me.teams[0];
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Exedra</CardTitle>
        <CardDescription>
          {primaryTeam !== undefined ? `${primaryTeam.orgName} · ${primaryTeam.name}` : "Signed in"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Structured stakeholder alignment — session tooling comes next.
        </p>
      </CardContent>
    </Card>
  );
}

export function App() {
  const inviteToken = parseInviteToken(window.location.pathname);
  const joinTeamToken = parseJoinTeamToken(window.location.pathname);
  const deepLinkToken = inviteToken ?? joinTeamToken;
  const [session, setSession] = useState<AuthSessionResponse | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(deepLinkToken === null);

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

  function handleOnboardingComplete(team: MeTeam) {
    setMe({
      user: me?.user ?? { id: "", registryUserId: "" },
      teams: [team],
      onboardingRequired: false,
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      {inviteToken !== null ? (
        <InviteGate token={inviteToken} />
      ) : joinTeamToken !== null ? (
        <JoinTeamGate token={joinTeamToken} />
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <Home session={session} me={me} onOnboardingComplete={handleOnboardingComplete} />
      )}
    </div>
  );
}

export default App;
