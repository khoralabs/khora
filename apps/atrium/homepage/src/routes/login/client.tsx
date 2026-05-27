import { createRegistryEmailConfirmApi } from "@khoralabs/users-auth/client";
import { EmailConfirm } from "@khoralabs/users-react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { ArrowLeftIcon, ArrowRight, Loader } from "lucide-react";
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

function registryUrl(): string {
  if (typeof window !== "undefined") {
    const fromEnv = import.meta.env.BUN_PUBLIC_KHORA_REGISTRY_URL as string | undefined;
    if (fromEnv !== undefined && fromEnv.length > 0) {
      return fromEnv.replace(/\/$/, "");
    }
  }
  return "http://localhost:4000";
}

const emailConfirmApi = createRegistryEmailConfirmApi({
  registryUrl: registryUrl(),
  sourceApp: "atrium-homepage",
});

function nextPath(): string {
  const next = new URLSearchParams(window.location.search).get("next");
  if (next?.startsWith("/") && !next.startsWith("//")) {
    return next;
  }
  return "/";
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
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <EmailConfirm.Root
        api={emailConfirmApi}
        purpose="sign-in"
        otpLength={OTP_LENGTH}
        storageKey={LOGIN_STEP_STORAGE_KEY}
        onSuccess={() => {
          window.location.href = nextPath();
        }}
      >
        <EmailConfirm.EmailStep>
          {(props) => (
            <EmailFormCard
              email={props.email}
              error={props.error}
              loading={props.loading}
              onEmailChange={props.setEmail}
              onSubmit={() => void props.sendOtp()}
            />
          )}
        </EmailConfirm.EmailStep>
        <EmailConfirm.OtpStep>
          {(props) => (
            <OtpFormCard
              email={props.email}
              otp={props.otp}
              error={props.error}
              loading={props.loading}
              onOtpChange={props.setOtp}
              onBack={props.goBack}
              onSubmit={(code) => void props.verifyOtp(code)}
            />
          )}
        </EmailConfirm.OtpStep>
      </EmailConfirm.Root>
    </main>
  );
}

renderRoute(LoginPage);
