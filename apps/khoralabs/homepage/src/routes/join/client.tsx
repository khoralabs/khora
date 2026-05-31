import { EmailConfirm } from "@khoralabs/registry-accounts-react";
import { createRegistryEmailConfirmApi } from "@khoralabs/registry-auth/client";
import { Loader } from "lucide-react";
import { useState } from "react";

import { SiteLayout } from "@/components/site-layout";
import { getRegistryUrl } from "@/lib/registry-url";
import {
  consumerSubmitButtonClass,
  fieldTypographyMuted,
  inputControlClass,
  pageTitleClass,
} from "@/lib/ui-styles";
import { renderRoute } from "../../render-route";
import "../../../styles/globals.css";

const OTP_LENGTH = 6;

const emailConfirmApi = createRegistryEmailConfirmApi({
  registryUrl: getRegistryUrl(),
  sourceApp: "khoralabs-homepage",
});

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
              storageKey="khoralabs-homepage-join"
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
                  <>
                    <h1 className={pageTitleClass}>Join waitlist</h1>
                    <p className={`mt-4 ${fieldTypographyMuted}`}>
                      Verify your email to request early access.
                    </p>
                    <form
                      className="mt-10 flex flex-col gap-4"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void props.sendOtp();
                      }}
                    >
                      <input
                        type="email"
                        value={props.email}
                        onChange={(e) => props.setEmail(e.target.value)}
                        disabled={props.loading}
                        placeholder="Enter your email"
                        className={inputControlClass}
                        autoComplete="email"
                      />
                      {props.showMarketingConsent ? (
                        <label className={`flex items-start gap-2 ${fieldTypographyMuted}`}>
                          <input
                            type="checkbox"
                            checked={props.marketingConsent}
                            onChange={(e) => props.setMarketingConsent(e.target.checked)}
                            disabled={props.loading}
                            className="mt-1"
                          />
                          <span>Keep me updated about Khora news and product updates.</span>
                        </label>
                      ) : null}
                      <button
                        type="submit"
                        disabled={props.loading}
                        className={`${consumerSubmitButtonClass} inline-flex items-center justify-center gap-2`}
                      >
                        {props.loading ? <Loader className="size-4 animate-spin" /> : "Continue"}
                      </button>
                    </form>
                    {props.error !== null && (
                      <p className="mt-3 text-sm text-red-400">{props.error}</p>
                    )}
                  </>
                )}
              </EmailConfirm.EmailStep>
              <EmailConfirm.OtpStep>
                {(props) => (
                  <>
                    <h1 className={pageTitleClass}>Verify your email</h1>
                    <p className={`mt-4 ${fieldTypographyMuted}`}>
                      Enter the code sent to {props.email}
                    </p>
                    <div className="mt-10">
                      <input
                        inputMode="numeric"
                        maxLength={OTP_LENGTH}
                        value={props.otp}
                        onChange={(e) => props.setOtp(e.target.value)}
                        disabled={props.loading}
                        className={`${inputControlClass} tracking-widest`}
                        autoComplete="one-time-code"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={props.loading}
                      onClick={() => void props.verifyOtp()}
                      className={`${consumerSubmitButtonClass} mt-4 inline-flex items-center justify-center gap-2`}
                    >
                      {props.loading ? <Loader className="size-4 animate-spin" /> : "Verify"}
                    </button>
                    <button
                      type="button"
                      className={`mt-3 block text-sm ${fieldTypographyMuted} hover:underline`}
                      onClick={props.goBack}
                    >
                      Use a different email
                    </button>
                    {props.error !== null && (
                      <p className="mt-3 text-sm text-red-400">{props.error}</p>
                    )}
                  </>
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
