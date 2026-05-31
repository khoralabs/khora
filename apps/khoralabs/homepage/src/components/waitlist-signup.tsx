import { EmailConfirm } from "@khoralabs/registry-accounts-react";
import { createRegistryEmailConfirmApi } from "@khoralabs/registry-auth/client";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { ArrowLeftIcon, ArrowRight, Loader } from "lucide-react";
import { useState } from "react";

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
import { getRegistryUrl } from "@/lib/registry-url";

const OTP_LENGTH = 6;
const WAITLIST_STORAGE_KEY = "khoralabs-homepage-waitlist";

const emailConfirmApi = createRegistryEmailConfirmApi({
  registryUrl: getRegistryUrl(),
  sourceApp: "khoralabs-homepage",
});

type WaitlistEmailStepProps = {
  email: string;
  error: string | null;
  loading: boolean;
  marketingConsent: boolean;
  showMarketingConsent: boolean;
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
  onEmailChange,
  onMarketingConsentChange,
  onSubmit,
}: WaitlistEmailStepProps) {
  return (
    <form
      className="mt-8 max-w-md space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      aria-busy={loading}
    >
      <Label htmlFor="waitlist-email" className="sr-only">
        Email
      </Label>
      <InputGroup
        className="h-12 px-1 rounded-full border-0 bg-white/80 text-black shadow-[inset_2px_3px_8px_rgba(0,0,0,0.08),inset_-1px_-1px_3px_rgba(255,255,255,0.9)] ring-0 has-[[data-slot=input-group-control]:focus-visible]:shadow-[inset_2px_4px_10px_rgba(0,0,0,0.1),inset_-1px_-1px_3px_rgba(255,255,255,0.95)] has-[[data-slot=input-group-control]:focus-visible]:ring-0"
        {...(loading ? { "data-disabled": true as const } : {})}
      >
        <InputGroupInput
          id="waitlist-email"
          type="email"
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          disabled={loading}
          placeholder="Enter your email"
          className="border-0 bg-transparent text-[12px] text-black caret-black shadow-none transition-[color,box-shadow] placeholder:text-[#B0B0B0] focus-visible:ring-0"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            type="submit"
            disabled={loading}
            size="icon-sm"
            className="rounded-full"
            variant="default"
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
        <Field orientation="horizontal" className="text-[12px] leading-[1.45] text-[#838383]">
          <Checkbox
            id="waitlist-marketing"
            checked={marketingConsent}
            onCheckedChange={(checked) => onMarketingConsentChange(checked === true)}
            disabled={loading}
            className="border-0 bg-white/80 size-4"
          />
          <FieldLabel htmlFor="waitlist-marketing" className="font-normal leading-[1.45]">
            Keep me updated about Khora news and product updates.
          </FieldLabel>
        </Field>
      ) : null}
      {error !== null && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}

type WaitlistOtpStepProps = {
  email: string;
  otp: string;
  error: string | null;
  loading: boolean;
  onOtpChange: (otp: string) => void;
  onBack: () => void;
  onSubmit: (otp: string) => void;
};

export function WaitlistOtpStep({
  email,
  otp,
  error,
  loading,
  onOtpChange,
  onBack,
  onSubmit,
}: WaitlistOtpStepProps) {
  return (
    <div className="mt-8 max-w-md">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onBack}
          disabled={loading}
          className="shrink-0 text-[#838383] hover:bg-black/5 hover:text-black"
        >
          <ArrowLeftIcon className="size-4" />
        </Button>
        <p className="m-0 text-[14px] font-medium text-black">{email}</p>
      </div>
      <p className="mt-2 text-[12px] leading-[1.45] text-[#838383]">
        Enter the code we sent to your email
      </p>
      <div className="relative mt-4 w-fit" aria-busy={loading}>
        <InputOTP
          id="waitlist-otp"
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
        {loading ? (
          <Skeleton className="absolute inset-0 flex items-center justify-center rounded-md bg-[#E8E8E3]/80">
            <Spinner />
          </Skeleton>
        ) : null}
      </div>
      {error !== null && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function WaitlistSuccess() {
  return (
    <p className="mt-8 max-w-md text-[14px] leading-relaxed text-[#838383]">
      You&apos;re on the list. We&apos;ll reach out when a spot opens up.
    </p>
  );
}

export function WaitlistSignup() {
  const [confirmed, setConfirmed] = useState(false);

  if (confirmed) {
    return <WaitlistSuccess />;
  }

  return (
    <EmailConfirm.Root
      api={emailConfirmApi}
      purpose="sign-up"
      otpLength={OTP_LENGTH}
      storageKey={WAITLIST_STORAGE_KEY}
      marketing={{ listSlug: "khora-waitlist", sourceApp: "khoralabs-homepage" }}
      onSuccess={async (session) => {
        if (emailConfirmApi.subscribeMarketing !== undefined) {
          await emailConfirmApi.subscribeMarketing({
            email: session.user.email,
            listSlug: "khora-waitlist",
            sourceApp: "khoralabs-homepage",
          });
        }
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
            onEmailChange={props.setEmail}
            onMarketingConsentChange={props.setMarketingConsent}
            onSubmit={() => void props.sendOtp()}
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
            onOtpChange={props.setOtp}
            onBack={props.goBack}
            onSubmit={(code) => void props.verifyOtp(code)}
          />
        )}
      </EmailConfirm.OtpStep>
    </EmailConfirm.Root>
  );
}
