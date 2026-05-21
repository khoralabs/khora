import { authClient } from "@khoralabs/atrium-console-auth/client";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { ArrowLeftIcon, ArrowRight, Loader } from "lucide-react";
import { useState } from "react";
import { useLocalStorage } from "usehooks-ts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { renderRoute } from "../../render-route";
import "../../../styles/globals.css";

const OTP_LENGTH = 6;
const LOGIN_STEP_STORAGE_KEY = "atrium-login-step";

type LoginStep = "email" | "otp";

function nextPath(): string {
  const next = new URLSearchParams(window.location.search).get("next");
  if (next?.startsWith("/") && !next.startsWith("//")) {
    return next;
  }
  return "/admin";
}

type EmailFormCardProps = {
  email: string;
  error: string | null;
  loading: boolean;
  onEmailChange: (email: string) => void;
  onSubmit: () => void;
};

function EmailFormCard({ email, error, loading, onEmailChange, onSubmit }: EmailFormCardProps) {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Atrium</CardTitle>
        <CardDescription>Sign in with a one-time code sent to your email</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          aria-busy={loading}
        >
          <Label htmlFor="email" className="sr-only">
            Email
          </Label>
          <InputGroup {...(loading ? { "data-disabled": true as const } : {})}>
            <InputGroupInput
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              disabled={loading}
              placeholder="Email"
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                type="submit"
                disabled={loading}
                variant="ghost"
                size="icon-sm"
                aria-label={loading ? "Sending code" : "Send code"}
              >
                {loading ? (
                  <Loader className="size-4 animate-spin" aria-hidden />
                ) : (
                  <ArrowRight className="size-4 stroke-[1.25]" aria-hidden />
                )}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          {error !== null && <p className="text-sm text-destructive">{error}</p>}
        </form>
      </CardContent>
    </Card>
  );
}

type OtpFormCardProps = {
  email: string;
  otp: string;
  error: string | null;
  loading: boolean;
  onOtpChange: (otp: string) => void;
  onBack: () => void;
  onSubmit: (otp: string) => void;
};

function OtpFormCard({
  email,
  otp,
  error,
  loading,
  onOtpChange,
  onBack,
  onSubmit,
}: OtpFormCardProps) {
  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="icon-sm" onClick={onBack} disabled={loading}>
            <ArrowLeftIcon className="size-4" />
          </Button>
          <CardTitle>{email}</CardTitle>
        </span>
        <CardDescription>Enter the code we sent to your email</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative mx-auto w-fit" aria-busy={loading}>
          <InputOTP
            id="otp"
            maxLength={OTP_LENGTH}
            pattern={REGEXP_ONLY_DIGITS}
            autoComplete="one-time-code"
            autoFocus
            value={otp}
            onChange={onOtpChange}
            onComplete={onSubmit}
            disabled={loading}
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
          {loading && (
            <Skeleton className="absolute inset-0 flex items-center justify-center rounded-md bg-background/80">
              <Spinner />
            </Skeleton>
          )}
        </div>
        {error !== null && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

function LoginPage() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep, removeStep] = useLocalStorage<LoginStep>(LOGIN_STEP_STORAGE_KEY, "email");
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
    setEmail(trimmed);
    setStep("otp");
  };

  const signIn = async (otpCode: string) => {
    if (loading) return;
    const trimmedEmail = email.trim();
    const trimmedOtp = otpCode.trim();
    if (trimmedEmail.length === 0 || trimmedOtp.length !== OTP_LENGTH) {
      setError(`Enter email and ${OTP_LENGTH}-digit code`);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: signInError } = await authClient.signIn.emailOtp({
      email: trimmedEmail,
      otp: trimmedOtp,
    });
    if (signInError || data?.user == null) {
      setLoading(false);
      setError(signInError?.message ?? "Sign in failed");
      return;
    }
    const { data: session } = await authClient.getSession();
    setLoading(false);
    if (session?.user == null) {
      setError("Signed in but session could not be verified. Try again.");
      return;
    }
    removeStep();
    window.location.href = nextPath();
  };

  const goBack = () => {
    setStep("email");
    setOtp("");
    setError(null);
  };

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      {step === "otp" ? (
        <OtpFormCard
          email={email}
          otp={otp}
          error={error}
          loading={loading}
          onOtpChange={setOtp}
          onBack={goBack}
          onSubmit={signIn}
        />
      ) : (
        <EmailFormCard
          email={email}
          error={error}
          loading={loading}
          onEmailChange={setEmail}
          onSubmit={sendOtp}
        />
      )}
    </main>
  );
}

renderRoute(LoginPage);
