import type {
  EmailConfirmApi,
  EmailConfirmPurpose,
  EmailConfirmSession,
} from "@khoralabs/users-auth/client";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { type EmailConfirmMarketingConfig, useEmailConfirmFlow } from "./use-email-confirm-flow.ts";

export type EmailConfirmContextValue = ReturnType<typeof useEmailConfirmFlow>;

const EmailConfirmContext = createContext<EmailConfirmContextValue | null>(null);

export function useEmailConfirm(): EmailConfirmContextValue {
  const ctx = useContext(EmailConfirmContext);
  if (ctx === null) {
    throw new Error("useEmailConfirm must be used within EmailConfirm.Root");
  }
  return ctx;
}

export type EmailConfirmProviderProps = {
  api: EmailConfirmApi;
  purpose: EmailConfirmPurpose;
  otpLength?: number;
  storageKey?: string;
  marketing?: EmailConfirmMarketingConfig;
  onSuccess?: (session: EmailConfirmSession) => void;
  children: ReactNode;
};

export function EmailConfirmProvider({
  api,
  purpose,
  otpLength,
  storageKey,
  marketing,
  onSuccess,
  children,
}: EmailConfirmProviderProps) {
  const flow = useEmailConfirmFlow({
    api,
    purpose,
    otpLength,
    storageKey,
    marketing,
    onSuccess,
  });

  const value = useMemo(() => flow, [flow]);

  return <EmailConfirmContext.Provider value={value}>{children}</EmailConfirmContext.Provider>;
}
