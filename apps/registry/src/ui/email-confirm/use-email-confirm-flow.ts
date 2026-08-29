import type {
  EmailConfirmApi,
  EmailConfirmPurpose,
  EmailConfirmSession,
} from "@khoralabs/registry/auth/client";
import { useCallback, useRef, useState } from "react";
import { useLocalStorage } from "usehooks-ts";

export type EmailConfirmStep = "email" | "otp";

export type EmailConfirmMarketingConfig = {
  listSlug: string;
  sourceApp?: string;
};

export type UseEmailConfirmFlowOptions = {
  api: EmailConfirmApi;
  purpose: EmailConfirmPurpose;
  otpLength?: number;
  storageKey?: string;
  marketing?: EmailConfirmMarketingConfig;
  onSuccess?: (session: EmailConfirmSession) => void;
};

export type EmailConfirmFlowState = {
  step: EmailConfirmStep;
  email: string;
  otp: string;
  error: string | null;
  loading: boolean;
  marketingConsent: boolean;
  showMarketingConsent: boolean;
  otpLength: number;
  setEmail: (email: string) => void;
  setOtp: (otp: string) => void;
  setMarketingConsent: (consent: boolean) => void;
  sendOtp: () => Promise<void>;
  verifyOtp: (otpCode?: string) => Promise<void>;
  goBack: () => void;
};

function useStepPersistence(
  storageKey: string | undefined,
  defaultStep: EmailConfirmStep,
): [EmailConfirmStep, (step: EmailConfirmStep) => void, () => void] {
  const ephemeralKeyRef = useRef(`email-confirm-${crypto.randomUUID()}`);
  const key = storageKey ?? ephemeralKeyRef.current;
  return useLocalStorage<EmailConfirmStep>(key, defaultStep);
}

export function useEmailConfirmFlow(options: UseEmailConfirmFlowOptions): EmailConfirmFlowState {
  const { api, purpose, otpLength = 6, storageKey, marketing, onSuccess } = options;

  const showMarketingConsent = marketing !== undefined && api.subscribeMarketing !== undefined;

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep, removeStep] = useStepPersistence(storageKey, "email");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);

  const sendOtp = useCallback(async () => {
    const trimmed = email.trim();
    if (trimmed.length === 0) {
      setError("Enter your email");
      return;
    }
    setLoading(true);
    setError(null);

    const result = await api.sendOtp({ email: trimmed, purpose });
    if (!result.ok) {
      setLoading(false);
      setError(result.error);
      return;
    }

    if (showMarketingConsent && marketingConsent && api.subscribeMarketing !== undefined) {
      const marketingResult = await api.subscribeMarketing({
        email: trimmed,
        listSlug: marketing.listSlug,
        sourceApp: marketing.sourceApp,
      });
      if (!marketingResult.ok) {
        console.warn("[email-confirm] marketing subscribe failed:", marketingResult.error);
      }
    }

    setEmail(trimmed);
    setStep("otp");
    setLoading(false);
  }, [api, email, marketing, marketingConsent, purpose, setStep, showMarketingConsent]);

  const verifyOtp = useCallback(
    async (otpCode?: string) => {
      if (loading) return;
      const trimmedEmail = email.trim();
      const trimmedOtp = (otpCode ?? otp).trim();
      if (trimmedEmail.length === 0 || trimmedOtp.length !== otpLength) {
        setError(`Enter email and ${otpLength}-digit code`);
        return;
      }
      setLoading(true);
      setError(null);

      const verifyResult = await api.verifyOtp({
        email: trimmedEmail,
        otp: trimmedOtp,
        purpose,
      });
      if (!verifyResult.ok) {
        setLoading(false);
        setError(verifyResult.error);
        return;
      }

      const sessionResult = await api.confirmSession();
      setLoading(false);
      if (!sessionResult.ok || sessionResult.session === undefined) {
        setError(
          sessionResult.ok ? "Session could not be verified. Try again." : sessionResult.error,
        );
        return;
      }

      removeStep();
      onSuccess?.(sessionResult.session);
    },
    [api, email, loading, onSuccess, otp, otpLength, purpose, removeStep],
  );

  const goBack = useCallback(() => {
    setStep("email");
    setOtp("");
    setError(null);
  }, [setStep]);

  return {
    step,
    email,
    otp,
    error,
    loading,
    marketingConsent,
    showMarketingConsent,
    otpLength,
    setEmail,
    setOtp,
    setMarketingConsent,
    sendOtp,
    verifyOtp,
    goBack,
  };
}
