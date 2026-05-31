import { EmailConfirm } from "@khoralabs/registry-accounts-react";
import { createRegistryEmailConfirmApi } from "@khoralabs/registry-auth/client";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { ArrowLeftIcon, ArrowRight, Loader } from "lucide-react";
import { useState } from "react";

import { SiteLayout } from "@/components/site-layout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  consumerInputGroupAddonClass,
  consumerInputGroupInnerClass,
  consumerInputGroupShellClass,
  consumerMarketingCheckboxClass,
  consumerSubmitButtonClass,
  fieldTypographyMuted,
  pageTitleClass,
} from "@/lib/ui-styles";
import { renderRoute } from "../../render-route";
import "../../../styles/globals.css";

const OTP_LENGTH = 6;
const JOIN_STEP_STORAGE_KEY = "khoralabs-homepage-join";

const emailConfirmApi = createRegistryEmailConfirmApi({
  registryUrl: getRegistryUrl(),
  sourceApp: "khoralabs-homepage",
});

type EmailStepProps = {
  email: string;
  error: string | null;
  loading: boolean;
  marketingConsent: boolean;
  showMarketingConsent: boolean;
  onEmailChange: (email: string) => void;
  onMarketingConsentChange: (checked: boolean) => void;
  onSubmit: () => void;
};

function JoinEmailStep({
  email,
  error,
  loading,
  marketingConsent,
  showMarketingConsent,
  onEmailChange,
  onMarketingConsentChange,
  onSubmit,
}: EmailStepProps) {
  return (
    <>
      <h1 className={pageTitleClass}>Join waitlist</h1>
      <p className={`mt-4 ${fieldTypographyMuted}`}>Verify your email to request early access.</p>
      <form
        className="mt-10 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        aria-busy={loading}
      >
        <Label htmlFor="join-email" className="sr-only">
          Email
        </Label>
        <InputGroup
          className={consumerInputGroupShellClass}
          {...(loading ? { "data-disabled": true as const } : {})}
        >
          <InputGroupInput
            id="join-email"
            type="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            disabled={loading}
            placeholder="Enter your email"
            className={consumerInputGroupInnerClass}
          />
          <InputGroupAddon align="inline-end" className={consumerInputGroupAddonClass}>
            <InputGroupButton
              type="submit"
              disabled={loading}
              className={consumerSubmitButtonClass}
              aria-label={loading ? "Sending code" : "Continue"}
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
          <div className={consumerMarketingCheckboxClass}>
            <Checkbox
              id="join-marketing"
              checked={marketingConsent}
              onCheckedChange={(checked) => onMarketingConsentChange(checked === true)}
              disabled={loading}
            />
            <Label htmlFor="join-marketing" className="font-normal leading-[1.45]">
              Keep me updated about Khora news and product updates.
            </Label>
          </div>
        ) : null}
        {error !== null && <p className="text-sm text-destructive">{error}</p>}
      </form>
    </>
  );
}

type OtpStepProps = {
  email: string;
  otp: string;
  error: string | null;
  loading: boolean;
  onOtpChange: (otp: string) => void;
  onBack: () => void;
  onSubmit: (otp: string) => void;
};

function JoinOtpStep({ email, otp, error, loading, onOtpChange, onBack, onSubmit }: OtpStepProps) {
  return (
    <>
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
        <h1 className={pageTitleClass}>{email}</h1>
      </div>
      <p className={`mt-4 ${fieldTypographyMuted}`}>Enter the code we sent to your email</p>
      <div className="relative mt-10 w-fit" aria-busy={loading}>
        <InputOTP
          id="join-otp"
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
    </>
  );
}

function JoinWaitlistPage() {
  const [confirmed, setConfirmed] = useState(false);

  if (confirmed) {
    return (
      <SiteLayout.Root>
        <SiteLayout.Noise />
        <SiteLayout.Frame>
          <SiteLayout.Header />
          <SiteLayout.Main className="justify-start md:justify-center">
            <div className="mx-auto w-full max-w-lg text-left">
              <h1 className={pageTitleClass}>You&apos;re on the list</h1>
              <p className={`mt-4 ${fieldTypographyMuted}`}>
                Thanks for signing up. We&apos;ll reach out when a spot opens up.
              </p>
            </div>
          </SiteLayout.Main>
          <SiteLayout.Footer />
        </SiteLayout.Frame>
      </SiteLayout.Root>
    );
  }

  return (
    <SiteLayout.Root>
      <SiteLayout.Noise />
      <SiteLayout.Frame>
        <SiteLayout.Header />
        <SiteLayout.Main className="justify-start md:justify-center">
          <div className="mx-auto w-full max-w-lg text-left">
            <EmailConfirm.Root
              api={emailConfirmApi}
              purpose="sign-up"
              otpLength={OTP_LENGTH}
              storageKey={JOIN_STEP_STORAGE_KEY}
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
                  <JoinEmailStep
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
                  <JoinOtpStep
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
          </div>
        </SiteLayout.Main>
        <SiteLayout.Footer />
      </SiteLayout.Frame>
    </SiteLayout.Root>
  );
}

renderRoute(JoinWaitlistPage);
