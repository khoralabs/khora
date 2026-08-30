import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createRegistryEmailConfirmApi } from "@/services/auth";
import { useEmailConfirmFlow } from "@/ui/email-confirm";
import { renderRoute } from "../../../render-route";
import "../../../../styles/globals.css";

const emailConfirmApi = createRegistryEmailConfirmApi({
  registryUrl: window.location.origin,
});

function userCodeFromQuery(): string {
  const raw = new URLSearchParams(window.location.search).get("user_code")?.trim() ?? "";
  return raw.toUpperCase();
}

function CliLinkPage() {
  const userCode = userCodeFromQuery();
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [approvePending, setApprovePending] = useState(false);
  const [approved, setApproved] = useState(false);

  const flow = useEmailConfirmFlow({
    api: emailConfirmApi,
    purpose: "sign-in",
    otpLength: 6,
    onSuccess: (session) => {
      setSessionEmail(session.user.email);
    },
  });

  const refreshSession = useCallback(async () => {
    setSessionLoading(true);
    const result = await emailConfirmApi.confirmSession();
    if (result.ok && result.session !== undefined) {
      setSessionEmail(result.session.user.email);
    } else {
      setSessionEmail(null);
    }
    setSessionLoading(false);
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  async function onApprove() {
    if (userCode.length === 0) {
      setApproveError("Missing user_code in URL. Run khora link again.");
      return;
    }
    setApprovePending(true);
    setApproveError(null);
    try {
      const res = await fetch("/v1/device/approve", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_code: userCode }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setApproveError(j.error ?? "Approval failed");
        return;
      }
      setApproved(true);
    } catch {
      setApproveError("Approval failed");
    } finally {
      setApprovePending(false);
    }
  }

  if (userCode.length === 0) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invalid link</CardTitle>
            <CardDescription>Start linking from the terminal with khora link.</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  if (approved) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>CLI authorized</CardTitle>
            <CardDescription>
              You can close this tab and return to the terminal. Code: {userCode}
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  if (sessionLoading) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    );
  }

  if (sessionEmail === null) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Sign in to link CLI</CardTitle>
            <CardDescription>
              Verify your email, then approve device code {userCode}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {flow.step === "email" ? (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void flow.sendOtp();
                }}
              >
                <label className="block text-sm font-medium" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={flow.email}
                  onChange={(e) => flow.setEmail(e.target.value)}
                  disabled={flow.loading}
                />
                {flow.error !== null && <p className="text-sm text-destructive">{flow.error}</p>}
                <Button type="submit" disabled={flow.loading}>
                  Send code
                </Button>
              </form>
            ) : (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void flow.verifyOtp();
                }}
              >
                <p className="text-sm text-muted-foreground">Code sent to {flow.email}</p>
                <label className="block text-sm font-medium" htmlFor="otp">
                  One-time code
                </label>
                <input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="w-full rounded-md border px-3 py-2 text-sm tracking-widest"
                  value={flow.otp}
                  onChange={(e) => flow.setOtp(e.target.value)}
                  disabled={flow.loading}
                />
                {flow.error !== null && <p className="text-sm text-destructive">{flow.error}</p>}
                <div className="flex gap-2">
                  <Button type="button" onClick={flow.goBack} disabled={flow.loading}>
                    Back
                  </Button>
                  <Button type="submit" disabled={flow.loading}>
                    Verify
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Approve CLI link</CardTitle>
          <CardDescription>
            Signed in as {sessionEmail}. Approve linking your terminal (code {userCode}).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {approveError !== null && <p className="text-sm text-destructive">{approveError}</p>}
          <Button type="button" disabled={approvePending} onClick={() => void onApprove()}>
            {approvePending ? "Approving…" : "Approve CLI"}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

renderRoute(CliLinkPage);
