import { useEffect, useState } from "react";

import { InviteGate } from "@/components/auth/invite-gate";
import { SignIn } from "@/components/auth/sign-in";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type AuthSessionResponse, fetchAuthSession } from "@/lib/auth-session";

import "./index.css";

function parseInviteToken(pathname: string): string | null {
  const match = /^\/invite\/([^/]+)\/?$/.exec(pathname);
  return match?.[1] ?? null;
}

function Home({ session }: { session: AuthSessionResponse | null }) {
  if (session?.authenticated === true) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Exedra</CardTitle>
          <CardDescription>Signed in as registry user {session.user.id}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Structured stakeholder alignment — session tooling comes next.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <SignIn
      onSuccess={() => {
        window.location.reload();
      }}
    />
  );
}

export function App() {
  const inviteToken = parseInviteToken(window.location.pathname);
  const [session, setSession] = useState<AuthSessionResponse | null>(null);
  const [loading, setLoading] = useState(inviteToken === null);

  useEffect(() => {
    if (inviteToken !== null) return;

    let cancelled = false;
    void fetchAuthSession().then((result) => {
      if (!cancelled) {
        setSession(result);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      {inviteToken !== null ? (
        <InviteGate token={inviteToken} />
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <Home session={session} />
      )}
    </div>
  );
}

export default App;
