import type { EmailConfirmSession } from "@khoralabs/registry-auth/client";
import { useCallback, useEffect, useState } from "react";

import { SignIn } from "@/components/auth/sign-in";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchAuthSession } from "@/lib/auth-session";

type InviteInfo = {
  token: string;
  topic: string;
  status: "pending" | "accepted" | "expired";
  sessionId?: string;
  alreadyJoined?: boolean;
  redirectTo?: string;
};

type InviteGateProps = {
  token: string;
};

function redirectToInviteTarget(path: string) {
  window.location.assign(path);
}

export function InviteGate({ token }: InviteGateProps) {
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  const acceptInvite = useCallback(async () => {
    setAccepting(true);
    setError(null);

    const res = await fetch(`/api/invites/${encodeURIComponent(token)}/accept`, {
      method: "POST",
      credentials: "include",
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Could not accept this invite.");
      setAccepting(false);
      return;
    }

    const body = (await res.json()) as { redirectTo: string };
    redirectToInviteTarget(body.redirectTo);
  }, [token]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const [sessionRes, inviteRes] = await Promise.all([
        fetchAuthSession(),
        fetch(`/api/invites/${encodeURIComponent(token)}`, { credentials: "include" }),
      ]);

      if (cancelled) return;

      if (!inviteRes.ok) {
        setError("This invite link is invalid or has expired.");
        setLoading(false);
        return;
      }

      const inviteData = (await inviteRes.json()) as InviteInfo;

      if (inviteData.alreadyJoined === true && inviteData.redirectTo !== undefined) {
        redirectToInviteTarget(inviteData.redirectTo);
        return;
      }

      const authenticated = sessionRes?.authenticated === true;

      if (authenticated && inviteData.status !== "pending") {
        setError("This invite link has already been used.");
        setLoading(false);
        return;
      }

      setInvite(inviteData);
      setLoading(false);

      if (authenticated && inviteData.status === "pending") {
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
    return <p className="text-sm text-muted-foreground">Accepting invite…</p>;
  }

  if (error !== null) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Could not join session</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <SignIn
      title={`Join ${invite.topic}`}
      description={`Sign in with the email your facilitator invited to review “${invite.topic}”.`}
      storageKey={`exedra-invite-${token}`}
      onSuccess={handleSignedIn}
    />
  );
}
