import { EmailConfirm } from "@khoralabs/registry-accounts-react";
import type { EmailConfirmSession } from "@khoralabs/registry-auth/client";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { ArrowLeft, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { registryEmailConfirmApi } from "@/lib/registry-email-confirm-api";

const OTP_LENGTH = 6;
const SIGN_IN_STORAGE_KEY = "exedra-sign-in";

const DEFAULT_SIGN_IN_DESCRIPTION =
  process.env.BUN_PUBLIC_EXEDRA_STUB_REGISTRY === "1"
    ? "Local stub registry — use any email and OTP 000000 (or EXEDRA_STUB_REGISTRY_OTP)."
    : "Enter your email to receive a one-time code from the Khora registry.";

type SignInProps = {
  title?: string;
  description?: string;
  storageKey?: string;
  onSuccess: (session: EmailConfirmSession) => void;
};

export function SignIn({
  title = "Sign in to Exedra",
  description = DEFAULT_SIGN_IN_DESCRIPTION,
  storageKey = SIGN_IN_STORAGE_KEY,
  onSuccess,
}: SignInProps) {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <EmailConfirm.Root
          api={registryEmailConfirmApi}
          purpose="sign-in"
          otpLength={OTP_LENGTH}
          storageKey={storageKey}
          onSuccess={onSuccess}
        >
          <EmailConfirm.EmailStep>
            {(props) => (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void props.sendOtp();
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="exedra-sign-in-email">Email</Label>
                  <Input
                    id="exedra-sign-in-email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    value={props.email}
                    onChange={(e) => props.setEmail(e.target.value)}
                    disabled={props.loading}
                    placeholder="you@company.com"
                  />
                </div>
                {props.error !== null ? (
                  <p className="text-sm text-destructive">{props.error}</p>
                ) : null}
                <Button type="submit" className="w-full" disabled={props.loading}>
                  {props.loading ? (
                    <>
                      <Loader2 className="animate-spin" />
                      Sending code…
                    </>
                  ) : (
                    "Continue"
                  )}
                </Button>
              </form>
            )}
          </EmailConfirm.EmailStep>
          <EmailConfirm.OtpStep>
            {(props) => (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={props.goBack}
                    disabled={props.loading}
                  >
                    <ArrowLeft />
                  </Button>
                  <p className="truncate text-sm text-muted-foreground">{props.email}</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  Enter the code we sent to your email.
                </p>
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
                {props.error !== null ? (
                  <p className="text-sm text-destructive">{props.error}</p>
                ) : null}
              </div>
            )}
          </EmailConfirm.OtpStep>
        </EmailConfirm.Root>
      </CardContent>
    </Card>
  );
}
