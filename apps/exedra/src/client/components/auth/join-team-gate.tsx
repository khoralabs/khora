import type { EmailConfirmSession } from "@khoralabs/registry-auth/client";
import { useCallback, useEffect, useState } from "react";

import { SignIn } from "@/components/auth/sign-in";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchAuthSession } from "@/lib/auth-session";

type JoinTeamInfo = {
  token: string;
  teamName: string;
  orgName: string;
  status: "pending" | "revoked";
};

type JoinTeamGateProps = {
  token: string;
};

export function JoinTeamGate({ token }: JoinTeamGateProps) {
  const [invite, setInvite] = useState<JoinTeamInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  const acceptInvite = useCallback(async () => {
    setAccepting(true);
    setError(null);

    const res = await fetch(`/api/join-team/${encodeURIComponent(token)}/accept`, {
      method: "POST",
      credentials: "include",
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Could not join this team.");
      setAccepting(false);
      return;
    }

    const body = (await res.json()) as { redirectTo: string };
    window.location.assign(body.redirectTo);
  }, [token]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const [sessionRes, inviteRes] = await Promise.all([
        fetchAuthSession(),
        fetch(`/api/join-team/${encodeURIComponent(token)}`),
      ]);

      if (cancelled) return;

      if (!inviteRes.ok) {
        setError("This team invite link is invalid or has expired.");
        setLoading(false);
        return;
      }

      const inviteData = (await inviteRes.json()) as JoinTeamInfo;
      if (inviteData.status !== "pending") {
        setError("This team invite link is no longer available.");
        setLoading(false);
        return;
      }

      setInvite(inviteData);
      setLoading(false);

      if (sessionRes?.authenticated === true) {
        void acceptInvite();
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [token, acceptInvite]);

  function handleSignedIn(_session: EmailConfirmSession) {
    void acceptInvite();
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading invite…</p>;
  }

  if (error !== null && invite === null) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Invite unavailable</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (invite === null) {
    return null;
  }

  if (accepting) {
    return <p className="text-sm text-muted-foreground">Joining team…</p>;
  }

  if (error !== null) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Could not join team</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <SignIn
      title={`Join ${invite.teamName}`}
      description={`Sign in to join ${invite.teamName} at ${invite.orgName} on Exedra.`}
      storageKey={`exedra-join-team-${token}`}
      onSuccess={handleSignedIn}
    />
  );
}
