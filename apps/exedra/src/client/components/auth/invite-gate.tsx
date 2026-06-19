import type { EmailConfirmSession } from "@khoralabs/registry-auth/client";
import { useCallback, useEffect, useState } from "react";

import { SignIn } from "@/components/auth/sign-in";
import { EntityAvatar } from "@/components/entity-avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { fetchAuthSession } from "@/lib/auth-session";
import { acceptTerms } from "@/lib/me-api";

type InviteInfo = {
  token: string;
  kind: "team" | "session";
  status: "pending" | "accepted";
  teamName?: string;
  orgName?: string;
  orgAvatarUrl?: string | null;
  topic?: string;
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
  const [authenticated, setAuthenticated] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

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
      setConfirmOpen(false);
      return;
    }

    if (termsAccepted) {
      try {
        await acceptTerms();
      } catch {
        // Non-blocking after invite accept.
      }
    }

    const body = (await res.json()) as { redirectTo: string };
    redirectToInviteTarget(body.redirectTo);
  }, [token, termsAccepted]);

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

      const isAuthenticated = sessionRes?.authenticated === true;
      setAuthenticated(isAuthenticated);

      if (isAuthenticated && inviteData.status !== "pending") {
        setError("This invite link has already been used.");
        setLoading(false);
        return;
      }

      setInvite(inviteData);
      setLoading(false);

      if (isAuthenticated && inviteData.status === "pending") {
        setConfirmOpen(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  function handleSignedIn(_session: EmailConfirmSession) {
    setAuthenticated(true);
    setConfirmOpen(true);
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

  const confirmTitle = invite.kind === "team" ? "Join team?" : "Join session?";
  const confirmDescription =
    invite.kind === "team" && invite.teamName !== undefined && invite.orgName !== undefined ? (
      <>
        Are you sure you want to join <strong>{invite.orgName}</strong>'s{" "}
        <strong>{invite.teamName}</strong> team?
      </>
    ) : invite.kind === "session" && invite.topic !== undefined ? (
      <>Are you sure you want to join the session for &ldquo;{invite.topic}&rdquo;?</>
    ) : (
      "Are you sure you want to accept this invite?"
    );

  const signInTitle =
    invite.kind === "team" && invite.teamName !== undefined
      ? `Join ${invite.teamName}`
      : invite.topic !== undefined
        ? `Join ${invite.topic}`
        : "Accept invite";

  const signInDescription =
    invite.kind === "team" && invite.teamName !== undefined && invite.orgName !== undefined
      ? `Sign in to join ${invite.teamName} at ${invite.orgName} on Exedra.`
      : invite.topic !== undefined
        ? `Sign in with the email your facilitator invited to review “${invite.topic}”.`
        : "Sign in to accept this invite on Exedra.";

  return (
    <>
      {!authenticated ? (
        <SignIn
          title={signInTitle}
          description={signInDescription}
          storageKey={`exedra-invite-${token}`}
          onSuccess={handleSignedIn}
        />
      ) : accepting ? (
        <p className="text-sm text-muted-foreground">Accepting invite…</p>
      ) : error !== null ? (
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Could not accept invite</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            {invite.orgName !== undefined ? (
              <AlertDialogMedia>
                <EntityAvatar
                  name={invite.orgName}
                  avatarUrl={invite.orgAvatarUrl}
                  size="lg"
                  className="size-16"
                />
              </AlertDialogMedia>
            ) : null}
            <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 text-sm text-muted-foreground">
                <div>{confirmDescription}</div>
                <Field orientation="horizontal">
                  <Checkbox
                    id="exedra-invite-terms"
                    checked={termsAccepted}
                    onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                    disabled={accepting}
                  />
                  <FieldLabel htmlFor="exedra-invite-terms" className="font-normal">
                    I agree to the{" "}
                    <a href="/terms" target="_blank" rel="noreferrer" className="underline">
                      Terms of Service
                    </a>{" "}
                    and{" "}
                    <a href="/privacy" target="_blank" rel="noreferrer" className="underline">
                      Privacy Policy
                    </a>
                    .
                  </FieldLabel>
                </Field>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={accepting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={accepting || !termsAccepted}
              onClick={(event) => {
                event.preventDefault();
                void acceptInvite();
              }}
            >
              {accepting ? <Spinner className="size-4" aria-hidden /> : "Join"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
