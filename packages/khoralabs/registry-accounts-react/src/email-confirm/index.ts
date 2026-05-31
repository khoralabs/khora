import { EmailConfirmEmailStep, EmailConfirmOtpStep, EmailConfirmRoot } from "./compound";

export const EmailConfirm = {
  Root: EmailConfirmRoot,
  EmailStep: EmailConfirmEmailStep,
  OtpStep: EmailConfirmOtpStep,
} as const;

export type { EmailConfirmProviderProps } from "./context";
export { useEmailConfirm } from "./context";
export type {
  EmailConfirmEmailStepRenderProps,
  EmailConfirmOtpStepRenderProps,
} from "./types";
export type {
  EmailConfirmFlowState,
  EmailConfirmMarketingConfig,
  EmailConfirmStep,
  UseEmailConfirmFlowOptions,
} from "./use-email-confirm-flow";
export { useEmailConfirmFlow } from "./use-email-confirm-flow";
