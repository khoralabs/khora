import { EmailConfirmEmailStep, EmailConfirmOtpStep, EmailConfirmRoot } from "./compound.tsx";

export const EmailConfirm = {
  Root: EmailConfirmRoot,
  EmailStep: EmailConfirmEmailStep,
  OtpStep: EmailConfirmOtpStep,
} as const;

export type { EmailConfirmProviderProps } from "./context.tsx";
export { useEmailConfirm } from "./context.tsx";
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
