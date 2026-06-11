import { EmailConfirm } from "@khoralabs/registry-accounts-react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { ArrowLeftIcon, ArrowRight, Loader } from "lucide-react";
import { useState } from "react";

import { terminalOtpSlotClass } from "@/components/terminal-panel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
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
import { logEvent } from "@/lib/log-event";
import { registryEmailConfirmApi } from "@/lib/registry-email-confirm-api";

const OTP_LENGTH = 6;
const WAITLIST_STORAGE_KEY = "khoralabs-homepage-waitlist";

type WaitlistEmailStepProps = {
  email: string;
  error: string | null;
  loading: boolean;
  marketingConsent: boolean;
  showMarketingConsent: boolean;
  autoFocus?: boolean;
  emailInputId?: string;
  marketingCheckboxId?: string;
  onEmailChange: (email: string) => void;
  onMarketingConsentChange: (checked: boolean) => void;
  onSubmit: () => void;
};

export function WaitlistEmailStep({
  email,
  error,
  loading,
  marketingConsent,
  showMarketingConsent,
  autoFocus = false,
  emailInputId = "waitlist-email",
  marketingCheckboxId = "waitlist-marketing",
  onEmailChange,
  onMarketingConsentChange,
  onSubmit,
}: WaitlistEmailStepProps) {
  return (
    <form
      className="max-w-md space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      aria-busy={loading}
    >
      <Label htmlFor={emailInputId} className="sr-only">
        Email
      </Label>
      <InputGroup
        className="h-12 border-[#F4F4EF]/12 bg-[#242424] px-1 shadow-none ring-0 has-[[data-slot=input-group-control]:focus-visible]:border-[#F4F4EF]/30 has-[[data-slot=input-group-control]:focus-visible]:ring-0"
        {...(loading ? { "data-disabled": true as const } : {})}
      >
        <InputGroupInput
          id={emailInputId}
          type="email"
          autoComplete="email"
          autoFocus={autoFocus}
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          disabled={loading}
          placeholder="Enter your email"
          className="border-0 bg-transparent font-landing-mono text-[11px] text-[#F4F4EF]/85 caret-[#F4F4EF]/85 shadow-none placeholder:text-[#F4F4EF]/30 focus-visible:ring-0 md:text-xs"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            type="submit"
            disabled={loading}
            size="icon-sm"
            variant="shell-ghost"
            aria-label={loading ? "Sending code" : "Join waitlist"}
          >
            {loading ? (
              <Loader className="size-4 animate-spin" aria-hidden />
            ) : (
              <ArrowRight className="size-4 stroke-[1.25]" aria-hidden />
            )}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {showMarketingConsent ? (
        <Field
          orientation="horizontal"
          className="font-landing-mono text-[11px] leading-[1.7] text-[#F4F4EF]/50"
        >
          <Checkbox
            id={marketingCheckboxId}
            checked={marketingConsent}
            onCheckedChange={(checked) => onMarketingConsentChange(checked === true)}
            disabled={loading}
            className="size-4 border-[#F4F4EF]/20 bg-[#2a2a2a] data-[state=checked]:border-[#F4F4EF]/40 data-[state=checked]:bg-[#F4F4EF]/15"
          />
          <FieldLabel htmlFor={marketingCheckboxId} className="font-normal leading-[1.7]">
            Keep me updated about Khora news and product updates.
          </FieldLabel>
        </Field>
      ) : null}
      {error !== null && <p className="font-landing-mono text-[11px] text-red-400/90">{error}</p>}
    </form>
  );
}

type WaitlistOtpStepProps = {
  email: string;
  otp: string;
  error: string | null;
  loading: boolean;
  otpInputId?: string;
  onOtpChange: (otp: string) => void;
  onBack: () => void;
  onSubmit: (otp: string) => void;
};

export function WaitlistOtpStep({
  email,
  otp,
  error,
  loading,
  otpInputId = "waitlist-otp",
  onOtpChange,
  onBack,
  onSubmit,
}: WaitlistOtpStepProps) {
  return (
    <div className="max-w-md space-y-4">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="shell-ghost"
          size="icon-xs"
          onClick={onBack}
          disabled={loading}
          className="shrink-0"
        >
          <ArrowLeftIcon className="size-3.5" />
        </Button>
        <p className="m-0 truncate font-landing-mono text-[11px] text-[#F4F4EF]/85 md:text-xs">
          {email}
        </p>
      </div>
      <p className="font-landing-mono text-[11px] leading-[1.7] text-[#F4F4EF]/50">
        Enter the code we sent to your email
      </p>
      <div className="relative w-fit" aria-busy={loading}>
        <InputOTP
          id={otpInputId}
          maxLength={OTP_LENGTH}
          pattern={REGEXP_ONLY_DIGITS}
          autoComplete="one-time-code"
          autoFocus
          value={otp}
          onChange={onOtpChange}
          onComplete={onSubmit}
          disabled={loading}
        >
          <InputOTPGroup className="gap-1.5">
            <InputOTPSlot index={0} className={terminalOtpSlotClass} />
            <InputOTPSlot index={1} className={terminalOtpSlotClass} />
            <InputOTPSlot index={2} className={terminalOtpSlotClass} />
            <InputOTPSlot index={3} className={terminalOtpSlotClass} />
            <InputOTPSlot index={4} className={terminalOtpSlotClass} />
            <InputOTPSlot index={5} className={terminalOtpSlotClass} />
          </InputOTPGroup>
        </InputOTP>
        {loading ? (
          <Skeleton className="absolute inset-0 flex items-center justify-center rounded-md bg-[#242424]/80">
            <Spinner className="text-[#F4F4EF]/50" />
          </Skeleton>
        ) : null}
      </div>
      {error !== null && <p className="font-landing-mono text-[11px] text-red-400/90">{error}</p>}
    </div>
  );
}

export function WaitlistSuccess() {
  return (
    <p className="max-w-md font-landing-mono text-[11px] leading-[1.7] text-[#F4F4EF]/70 md:text-xs">
      You&apos;re on the list. We&apos;ll reach out when a spot opens up.
    </p>
  );
}

type WaitlistSignupProps = {
  /** When false (default), avoids scrolling the page to this form on load. */
  autoFocusEmail?: boolean;
  idPrefix?: string;
};

export function WaitlistSignup({
  autoFocusEmail = false,
  idPrefix = "waitlist",
}: WaitlistSignupProps) {
  const [confirmed, setConfirmed] = useState(false);
  const emailInputId = `${idPrefix}-email`;
  const marketingCheckboxId = `${idPrefix}-marketing`;
  const otpInputId = `${idPrefix}-otp`;

  if (confirmed) {
    return <WaitlistSuccess />;
  }

  return (
    <EmailConfirm.Root
      api={registryEmailConfirmApi}
      purpose="sign-up"
      otpLength={OTP_LENGTH}
      storageKey={WAITLIST_STORAGE_KEY}
      marketing={{ listSlug: "khora-waitlist", sourceApp: "khoralabs-homepage" }}
      onSuccess={async (session) => {
        if (registryEmailConfirmApi.subscribeMarketing !== undefined) {
          await registryEmailConfirmApi.subscribeMarketing({
            email: session.user.email,
            listSlug: "khora-waitlist",
            sourceApp: "khoralabs-homepage",
          });
        }
        logEvent("waitlist.signup_completed");
        setConfirmed(true);
      }}
    >
      <EmailConfirm.EmailStep>
        {(props) => (
          <WaitlistEmailStep
            email={props.email}
            error={props.error}
            loading={props.loading}
            marketingConsent={props.marketingConsent}
            showMarketingConsent={props.showMarketingConsent}
            autoFocus={autoFocusEmail}
            emailInputId={emailInputId}
            marketingCheckboxId={marketingCheckboxId}
            onEmailChange={props.setEmail}
            onMarketingConsentChange={props.setMarketingConsent}
            onSubmit={() => {
              logEvent("waitlist.otp_requested");
              void props.sendOtp();
            }}
          />
        )}
      </EmailConfirm.EmailStep>
      <EmailConfirm.OtpStep>
        {(props) => (
          <WaitlistOtpStep
            email={props.email}
            otp={props.otp}
            error={props.error}
            loading={props.loading}
            otpInputId={otpInputId}
            onOtpChange={props.setOtp}
            onBack={props.goBack}
            onSubmit={(code) => {
              logEvent("waitlist.otp_verified");
              void props.verifyOtp(code);
            }}
          />
        )}
      </EmailConfirm.OtpStep>
    </EmailConfirm.Root>
  );
}
