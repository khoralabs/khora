import { useState } from "react";
import { authClient } from "@khoralabs/atrium-console-auth/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { renderRoute } from "../../render-route";
import "../../../styles/globals.css";

function nextPath(): string {
  const next = new URLSearchParams(window.location.search).get("next");
  if (next !== null && next.startsWith("/") && !next.startsWith("//")) {
    return next;
  }
  return "/admin";
}

function LoginPage() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const sendOtp = async () => {
    const trimmed = email.trim();
    if (trimmed.length === 0) {
      setError("Enter your email");
      return;
    }
    setLoading(true);
    setError(null);
    const { error: sendError } = await authClient.emailOtp.sendVerificationOtp({
      email: trimmed,
      type: "sign-in",
    });
    setLoading(false);
    if (sendError) {
      setError(sendError.message ?? "Failed to send code");
      return;
    }
    setOtpSent(true);
  };

  const signIn = async () => {
    const trimmedEmail = email.trim();
    const trimmedOtp = otp.trim();
    if (trimmedEmail.length === 0 || trimmedOtp.length === 0) {
      setError("Enter email and code");
      return;
    }
    setLoading(true);
    setError(null);
    const { error: signInError } = await authClient.signIn.emailOtp({
      email: trimmedEmail,
      otp: trimmedOtp,
    });
    setLoading(false);
    if (signInError) {
      setError(signInError.message ?? "Sign in failed");
      return;
    }
    window.location.href = nextPath();
  };

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Atrium Admin</CardTitle>
          <CardDescription>Sign in with a one-time code sent to your email</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={otpSent || loading}
            />
          </div>
          {otpSent && (
            <div className="space-y-2">
              <Label htmlFor="otp">Code</Label>
              <Input
                id="otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                disabled={loading}
              />
            </div>
          )}
          {error !== null && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            {!otpSent ? (
              <Button type="button" onClick={sendOtp} disabled={loading} className="w-full">
                {loading ? "Sending…" : "Send code"}
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => setOtpSent(false)} disabled={loading}>
                  Back
                </Button>
                <Button type="button" onClick={signIn} disabled={loading} className="flex-1">
                  {loading ? "Signing in…" : "Sign in"}
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

renderRoute(LoginPage);
