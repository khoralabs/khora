import type { EmailConfirmSession } from "@khoralabs/registry-auth/client";
import { useCallback, useEffect, useState } from "react";

import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { ConsentForm } from "@/components/auth/consent-form";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { useAnalytics } from "@/lib/analytics";
import { fetchAuthSession } from "@/lib/auth-session";
import { fetchMe, submitConsent } from "@/lib/me-api";

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
  const track = useAnalytics();
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [consentNeeded, setConsentNeeded] = useState(false);
  const [consentSubmitting, setConsentSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sessionConsentAccepted, setSessionConsentAccepted] = useState(false);

  const openPostAuthStep = useCallback(async () => {
    const me = await fetchMe();
    if (me === null) return;
    if (me.termsAcceptedAtMs === null) {
      setConsentNeeded(true);
      return;
    }
    setConfirmOpen(true);
  }, []);

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

    const body = (await res.json()) as { redirectTo: string };
    track("invite_accepted", {
      ...(invite?.sessionId !== undefined ? { sessionId: invite.sessionId } : {}),
    });
    redirectToInviteTarget(body.redirectTo);
  }, [invite?.sessionId, token, track]);

  const canJoin = invite?.kind !== "session" || sessionConsentAccepted;

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
        void openPostAuthStep();
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [token, openPostAuthStep]);

  async function handleSignedIn(_session: EmailConfirmSession) {
    setAuthenticated(true);
    await openPostAuthStep();
  }

  async function handleConsentAccept(opts: { marketing: boolean }) {
    setConsentSubmitting(true);
    try {
      await submitConsent(opts);
      setConsentNeeded(false);
      setConfirmOpen(true);
    } catch {
      setError("Could not save your consent. Try again.");
    } finally {
      setConsentSubmitting(false);
    }
  }

  if (loading) {
    return (
      <AuthPageShell>
        <p className="text-sm text-muted-foreground">Loading invite…</p>
      </AuthPageShell>
    );
  }

  if (error !== null && invite === null) {
    return (
      <AuthPageShell>
        <div className="space-y-2">
          <h1 className="font-serif text-3xl font-semibold tracking-tight">Invite unavailable</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </AuthPageShell>
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
      ? `Sign in to join ${invite.teamName} at ${invite.orgName}.`
      : invite.topic !== undefined
        ? `Sign in with the email your facilitator invited for “${invite.topic}”.`
        : "Sign in to accept this invite.";

  return (
    <>
      {!authenticated ? (
        <SignIn
          title={signInTitle}
          description={signInDescription}
          storageKey={`exedra-invite-${token}`}
          onSuccess={(session) => void handleSignedIn(session)}
        />
      ) : consentNeeded ? (
        <AuthPageShell>
          <ConsentForm onAccept={handleConsentAccept} submitting={consentSubmitting} />
        </AuthPageShell>
      ) : accepting ? (
        <AuthPageShell>
          <p className="text-sm text-muted-foreground">Accepting invite…</p>
        </AuthPageShell>
      ) : error !== null ? (
        <AuthPageShell>
          <div className="space-y-2">
            <h1 className="font-serif text-3xl font-semibold tracking-tight">
              Could not accept invite
            </h1>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        </AuthPageShell>
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
                {invite.kind === "session" && (
                  <Field orientation="horizontal">
                    <Checkbox
                      id="exedra-invite-session-consent"
                      checked={sessionConsentAccepted}
                      onCheckedChange={(checked: boolean | "indeterminate") =>
                        setSessionConsentAccepted(checked === true)
                      }
                      disabled={accepting}
                    />
                    <FieldLabel htmlFor="exedra-invite-session-consent" className="font-normal">
                      I understand that my responses will be reviewed by the session organizer,
                      processed by AI tools, and stored.
                    </FieldLabel>
                  </Field>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={accepting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={accepting || !canJoin}
              onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
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
