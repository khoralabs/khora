import { EmailConfirm } from "@khoralabs/registry-accounts-react";
import type { EmailConfirmSession } from "@khoralabs/registry-auth/client";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { ExedraBrand, KhoraWordmark } from "@/components/brand/khora-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { ASSETS } from "@/lib/asset-urls";
import { registryEmailConfirmApi } from "@/lib/registry-email-confirm-api";
import { cn } from "@/lib/utils";

const OTP_LENGTH = 6;
const SIGN_IN_STORAGE_KEY = "exedra-sign-in";
const MARKETING_LIST_SLUG = "khoralabs-updates";

const DEFAULT_TITLE = "Welcome back";
const DEFAULT_DESCRIPTION = "Sign in to Exedra with a one-time code sent to your email.";

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

function SignInPanel() {
  return (
    <div className="relative hidden overflow-hidden bg-muted md:block">
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-[0.08]"
        style={{ backgroundImage: `url(${ASSETS.consumerMesh})` }}
      />
      <div className="absolute inset-0 bg-linear-to-br from-primary/15 via-muted to-background" />
      <div className="relative flex h-full min-h-[32rem] flex-col justify-between p-8">
        <ExedraBrand />
        <div className="space-y-2">
          <p className="font-serif text-2xl font-semibold tracking-tight">
            Align before you decide.
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Structured interviews that surface what your team actually believes — one question at a
            time.
          </p>
        </div>
        <img
          src={ASSETS.logoCluster}
          alt=""
          aria-hidden
          className="pointer-events-none w-28 self-end opacity-25"
        />
      </div>
    </div>
  );
}

export function SignIn({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  storageKey = SIGN_IN_STORAGE_KEY,
  className,
  onSuccess,
}: SignInProps) {
  return (
    <div className={cn("flex w-full max-w-4xl flex-col gap-6", className)}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <EmailConfirm.Root
            api={registryEmailConfirmApi}
            purpose="sign-in"
            otpLength={OTP_LENGTH}
            storageKey={storageKey}
            marketing={{ listSlug: MARKETING_LIST_SLUG, sourceApp: "exedra" }}
            onSuccess={onSuccess}
          >
            <EmailConfirm.EmailStep>
              {(props) => (
                <form
                  className="p-6 md:p-8"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void props.sendOtp();
                  }}
                  aria-busy={props.loading}
                >
                  <FieldGroup>
                    <div className="flex flex-col items-center gap-3 text-center">
                      <KhoraWordmark className="h-4" />
                      <div className="space-y-2">
                        <h1 className="text-2xl font-bold">{title}</h1>
                        <p className="text-balance text-muted-foreground">{description}</p>
                      </div>
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
                    </Field>
                    {props.showMarketingConsent ? (
                      <Field orientation="horizontal">
                        <Checkbox
                          id="exedra-sign-in-marketing"
                          checked={props.marketingConsent}
                          onCheckedChange={(checked) => props.setMarketingConsent(checked === true)}
                          disabled={props.loading}
                        />
                        <FieldLabel htmlFor="exedra-sign-in-marketing" className="font-normal">
                          Keep me updated about Khora news and product updates.
                        </FieldLabel>
                      </Field>
                    ) : null}
                    {props.error !== null ? <FieldError>{props.error}</FieldError> : null}
                  </FieldGroup>
                </form>
              )}
            </EmailConfirm.EmailStep>
            <EmailConfirm.OtpStep>
              {(props) => (
                <div className="p-6 md:p-8">
                  <FieldGroup>
                    <div className="flex flex-col items-center gap-3 text-center">
                      <KhoraWordmark className="h-4" />
                      <div className="space-y-2">
                        <h1 className="text-2xl font-bold">Check your email</h1>
                        <p className="text-balance text-muted-foreground">
                          Enter the {OTP_LENGTH}-digit code we sent to{" "}
                          <span className="font-medium text-foreground">{props.email}</span>.
                        </p>
                      </div>
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
                        <FieldDescription className="text-center">
                          <Spinner className="mr-1 inline size-3" aria-hidden />
                          Verifying…
                        </FieldDescription>
                      ) : null}
                    </Field>
                    {props.error !== null ? <FieldError>{props.error}</FieldError> : null}
                  </FieldGroup>
                </div>
              )}
            </EmailConfirm.OtpStep>
          </EmailConfirm.Root>
          <SignInPanel />
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center">
        By continuing, you agree to sign in through the Khora registry for this workspace.
      </FieldDescription>
    </div>
  );
}
