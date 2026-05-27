import type { ComponentProps, ReactNode } from "react";
import { cn } from "../admin/cn.ts";
import {
  EmailConfirmProvider,
  type EmailConfirmProviderProps,
  useEmailConfirm,
} from "./context.tsx";
import type { EmailConfirmEmailStepRenderProps, EmailConfirmOtpStepRenderProps } from "./types.ts";

export type EmailConfirmRootProps = EmailConfirmProviderProps &
  Omit<ComponentProps<"div">, "children">;

export function EmailConfirmRoot({
  api,
  purpose,
  otpLength,
  storageKey,
  marketing,
  onSuccess,
  className,
  children,
  ...props
}: EmailConfirmRootProps) {
  return (
    <EmailConfirmProvider
      api={api}
      purpose={purpose}
      otpLength={otpLength}
      storageKey={storageKey}
      marketing={marketing}
      onSuccess={onSuccess}
    >
      <div data-slot="email-confirm-root" className={cn(className)} {...props}>
        {children}
      </div>
    </EmailConfirmProvider>
  );
}

export type EmailConfirmEmailStepProps = {
  children: (props: EmailConfirmEmailStepRenderProps) => ReactNode;
};

export function EmailConfirmEmailStep({ children }: EmailConfirmEmailStepProps) {
  const flow = useEmailConfirm();
  if (flow.step !== "email") return null;

  return (
    <>
      {children({
        email: flow.email,
        error: flow.error,
        loading: flow.loading,
        marketingConsent: flow.marketingConsent,
        showMarketingConsent: flow.showMarketingConsent,
        setEmail: flow.setEmail,
        setMarketingConsent: flow.setMarketingConsent,
        sendOtp: flow.sendOtp,
      })}
    </>
  );
}

export type EmailConfirmOtpStepProps = {
  children: (props: EmailConfirmOtpStepRenderProps) => ReactNode;
};

export function EmailConfirmOtpStep({ children }: EmailConfirmOtpStepProps) {
  const flow = useEmailConfirm();
  if (flow.step !== "otp") return null;

  return (
    <>
      {children({
        email: flow.email,
        otp: flow.otp,
        error: flow.error,
        loading: flow.loading,
        otpLength: flow.otpLength,
        setOtp: flow.setOtp,
        verifyOtp: flow.verifyOtp,
        goBack: flow.goBack,
      })}
    </>
  );
}
