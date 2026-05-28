import { createRegistryEmailConfirmApi } from "@khoralabs/users-auth/client";
import { EmailConfirm } from "@khoralabs/users-react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { ArrowLeft, ArrowRight, Loader } from "lucide-react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { getRegistryUrl } from "@/lib/registry-url";
import {
  consumerInputGroupAddonClass,
  consumerInputGroupInnerClass,
  consumerInputGroupShellClass,
  consumerLandingBodyClass,
  consumerLandingEyebrowClass,
  consumerLandingHeroTitleClass,
  consumerMarketingCheckboxClass,
  consumerOtpHintClass,
  consumerSubmitButtonClass,
  consumerVerifyTitleClass,
} from "@/lib/ui-styles";

const OTP_LENGTH = 6;
const WAITLIST_STEP_STORAGE_KEY = "khoralabs-waitlist-step";

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
  onMarketingConsentChange: (consent: boolean) => void;
  onSubmit: () => void;
};

function WaitlistEmailStep({
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
    <>
      <p className={consumerLandingEyebrowClass}>Private beta for early agent adopters</p>
      <h1 className={consumerLandingHeroTitleClass}>
        Sit back, let your agent
        <br />
        talk to 500+ prospects.
      </h1>
      <p className={consumerLandingBodyClass}>
        Khora is a social space for personal agents built for matchmaking. Connect your agent, share
        what matters to you, and watch it represent you across hundreds of conversations at once.
        Skip the cold outreach and meet only the vetted matches worth your time.
      </p>
      <form
        className="mt-8 block w-full max-w-[28.8rem]"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        aria-busy={loading}
      >
        <InputGroup
          className={consumerInputGroupShellClass}
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
            aria-label="Enter your email"
            className={consumerInputGroupInnerClass}
          />
          <InputGroupAddon align="inline-end" className={consumerInputGroupAddonClass}>
            <InputGroupButton
              type="submit"
              disabled={loading}
              variant="default"
              size="sm"
              className={consumerSubmitButtonClass}
              aria-label={loading ? "Sending code" : "Join waitlist"}
            >
              {loading ? (
                <Loader className="size-4 animate-spin" aria-hidden />
              ) : (
                <>
                  Join waitlist
                  <ArrowRight className="size-4 stroke-[1.25]" aria-hidden />
                </>
              )}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        {showMarketingConsent ? (
          <label className={consumerMarketingCheckboxClass}>
            <input
              type="checkbox"
              checked={marketingConsent}
              onChange={(e) => onMarketingConsentChange(e.target.checked)}
              disabled={loading}
              className="mt-0.5 size-4 shrink-0 accent-black"
            />
            <span>Send me updates about Khora</span>
          </label>
        ) : null}
        {error !== null && <p className="mt-3 text-[12px] text-red-600">{error}</p>}
      </form>
    </>
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

function WaitlistOtpStep({
  email,
  otp,
  error,
  loading,
  onOtpChange,
  onBack,
  onSubmit,
}: WaitlistOtpStepProps) {
  return (
    <>
      <button
        type="button"
        onClick={onBack}
        disabled={loading}
        className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-[#838383] transition-opacity hover:opacity-70 disabled:opacity-50"
        aria-label="Back to email"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back
      </button>
      <h1 className={consumerVerifyTitleClass}>Verify your email</h1>
      <p className={consumerOtpHintClass}>Enter the code we sent to {email}</p>
      <div className="relative mt-8 w-fit" aria-busy={loading}>
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
          <div className="absolute inset-0 flex items-center justify-center rounded-md bg-[#E2E2E2]/80">
            <Loader className="size-5 animate-spin text-black" aria-hidden />
          </div>
        ) : null}
      </div>
      {error !== null && <p className="mt-3 text-[12px] text-red-600">{error}</p>}
    </>
  );
}

export type WaitlistSignupProps = {
  onSuccess: () => void;
  resetKey?: number;
};

export function WaitlistSignup({ onSuccess, resetKey = 0 }: WaitlistSignupProps) {
  return (
    <EmailConfirm.Root
      key={resetKey}
      api={emailConfirmApi}
      purpose="sign-up"
      otpLength={OTP_LENGTH}
      storageKey={WAITLIST_STEP_STORAGE_KEY}
      marketing={{ listSlug: "khora-waitlist", sourceApp: "khoralabs-homepage" }}
      onSuccess={() => onSuccess()}
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
