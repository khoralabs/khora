import type { EmailConfirmFlowState } from "./use-email-confirm-flow.ts";

export type EmailConfirmEmailStepRenderProps = Pick<
  EmailConfirmFlowState,
  | "email"
  | "error"
  | "loading"
  | "marketingConsent"
  | "showMarketingConsent"
  | "setEmail"
  | "setMarketingConsent"
  | "sendOtp"
>;

export type EmailConfirmOtpStepRenderProps = Pick<
  EmailConfirmFlowState,
  "email" | "otp" | "error" | "loading" | "otpLength" | "setOtp" | "verifyOtp" | "goBack"
>;
