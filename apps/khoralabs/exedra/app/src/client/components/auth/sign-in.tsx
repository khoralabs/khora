import { EmailConfirm } from "@khoralabs/registry-accounts-react";
import type { EmailConfirmSession } from "@khoralabs/registry-auth/client";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useCallback, useState } from "react";

import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { ConsentForm } from "@/components/auth/consent-form";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { fetchMe, submitConsent } from "@/lib/me-api";
import { registryEmailConfirmApi } from "@/lib/registry-email-confirm-api";

const OTP_LENGTH = 6;
const SIGN_IN_STORAGE_KEY = "exedra-sign-in";

const DEFAULT_TITLE = "Welcome back";
const DEFAULT_DESCRIPTION = "Sign in with a one-time code sent to your email.";

const STUB_HINT =
  process.env.BUN_PUBLIC_EXEDRA_STUB_REGISTRY === "1"
    ? "Local stub registry — use any email and OTP 000000 (or EXEDRA_STUB_REGISTRY_OTP)."
    : null;

type SignInProps = {
  title?: string;
  description?: string;
  storageKey?: string;
  className?: string;
  onSuccess: (session: EmailConfirmSession) => void;
};

export function SignIn({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  storageKey = SIGN_IN_STORAGE_KEY,
  className,
  onSuccess,
}: SignInProps) {
  const [step, setStep] = useState<"auth" | "consent">("auth");
  const [pendingSession, setPendingSession] = useState<EmailConfirmSession | null>(null);
  const [consentSubmitting, setConsentSubmitting] = useState(false);

  const handleOtpSuccess = useCallback(
    async (session: EmailConfirmSession) => {
      const me = await fetchMe().catch(() => null);
      if (me === null || me.termsAcceptedAtMs !== null) {
        onSuccess(session);
        return;
      }
      setPendingSession(session);
      setStep("consent");
    },
    [onSuccess],
  );

  const handleConsentAccept = useCallback(
    async (opts: { marketing: boolean }) => {
      setConsentSubmitting(true);
      try {
        await submitConsent(opts);
        if (pendingSession !== null) onSuccess(pendingSession);
      } finally {
        setConsentSubmitting(false);
      }
    },
    [pendingSession, onSuccess],
  );

  if (step === "consent") {
    return (
      <AuthPageShell className={className}>
        <ConsentForm onAccept={handleConsentAccept} submitting={consentSubmitting} />
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell className={className}>
      <EmailConfirm.Root
        api={registryEmailConfirmApi}
        purpose="sign-in"
        otpLength={OTP_LENGTH}
        storageKey={storageKey}
        onSuccess={handleOtpSuccess}
      >
        <EmailConfirm.EmailStep>
          {(props) => (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void props.sendOtp();
              }}
              aria-busy={props.loading}
            >
              <FieldGroup className="gap-6">
                <div className="space-y-2">
                  <h1 className="font-serif text-3xl font-semibold tracking-tight">{title}</h1>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </div>
                <Field>
                  <Label htmlFor="exedra-sign-in-email" className="sr-only">
                    Email
                  </Label>
                  <InputGroup
                    className="h-11"
                    {...(props.loading ? { "data-disabled": true as const } : {})}
                  >
                    <InputGroupInput
                      id="exedra-sign-in-email"
                      type="email"
                      autoComplete="email"
                      autoFocus
                      value={props.email}
                      onChange={(e) => props.setEmail(e.target.value)}
                      disabled={props.loading}
                      placeholder="you@company.com"
                      required
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        type="submit"
                        disabled={props.loading}
                        size="icon-sm"
                        aria-label={props.loading ? "Sending code" : "Continue"}
                      >
                        {props.loading ? (
                          <Spinner className="size-4" aria-hidden />
                        ) : (
                          <ArrowRight className="size-4" aria-hidden />
                        )}
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                  {STUB_HINT !== null ? <FieldDescription>{STUB_HINT}</FieldDescription> : null}
                  <FieldDescription>
                    By requesting a sign-in code, you agree to share your email with Exedra. See our{" "}
                    <a href="/privacy" target="_blank" rel="noreferrer" className="underline">
                      Privacy Policy
                    </a>
                    .
                  </FieldDescription>
                </Field>
                {props.error !== null ? <FieldError>{props.error}</FieldError> : null}
              </FieldGroup>
            </form>
          )}
        </EmailConfirm.EmailStep>
        <EmailConfirm.OtpStep>
          {(props) => (
            <FieldGroup className="gap-6">
              <div className="space-y-2">
                <h1 className="font-serif text-3xl font-semibold tracking-tight">
                  Check your email
                </h1>
                <p className="text-sm text-muted-foreground">
                  Enter the {OTP_LENGTH}-digit code we sent to{" "}
                  <span className="font-medium text-foreground">{props.email}</span>.
                </p>
              </div>
              <Field>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={props.goBack}
                    disabled={props.loading}
                    aria-label="Use a different email"
                  >
                    <ArrowLeft />
                  </Button>
                  <FieldDescription className="truncate">{props.email}</FieldDescription>
                </div>
                <div className="flex justify-center pt-2">
                  <InputOTP
                    maxLength={OTP_LENGTH}
                    pattern={REGEXP_ONLY_DIGITS}
                    autoComplete="one-time-code"
                    autoFocus
                    value={props.otp}
                    onChange={props.setOtp}
                    onComplete={(code) => void props.verifyOtp(code)}
                    disabled={props.loading}
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
                </div>
                {props.loading ? (
                  <FieldDescription>
                    <Spinner className="mr-1 inline size-3" aria-hidden />
                    Verifying…
                  </FieldDescription>
                ) : null}
              </Field>
              {props.error !== null ? <FieldError>{props.error}</FieldError> : null}
            </FieldGroup>
          )}
        </EmailConfirm.OtpStep>
      </EmailConfirm.Root>
    </AuthPageShell>
  );
}
