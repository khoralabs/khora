import { EmailConfirm } from "@khoralabs/registry-accounts-react";
import { type SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { WaitlistOtpStep } from "@/components/waitlist-signup";
import { logEvent } from "@/lib/log-event";
import { registryEmailConfirmApi } from "@/lib/registry-email-confirm-api";
import { cn } from "@/lib/utils";

const OTP_LENGTH = 6;
const CONTACT_STORAGE_KEY = "khoralabs-homepage-contact";

const inputClass =
  "w-full rounded border border-[#F4F4EF]/35 bg-[#3F3F3F]/80 px-3 py-2.5 text-sm text-[#F4F4EF] outline-none ring-[#F4F4EF]/40 placeholder:text-[#F4F4EF]/40 focus:border-[#F4F4EF]/60 focus:ring-2 md:text-[15px]";

async function queueContact(
  email: string,
  message: string,
  marketingConsent: boolean,
): Promise<string | null> {
  const res = await fetch("/api/contact/queue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, message, marketingConsent }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { id?: string };
  return typeof data.id === "string" ? data.id : null;
}

async function confirmContact(submissionId: string): Promise<boolean> {
  const res = await fetch("/api/contact/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: submissionId }),
  });
  return res.status === 204;
}

async function cancelContactQueue(submissionId: string): Promise<void> {
  await fetch(`/api/contact/queue/${encodeURIComponent(submissionId)}`, {
    method: "DELETE",
  }).catch(() => {});
}

type ContactOtpPanelProps = {
  email: string;
  otp: string;
  error: string | null;
  loading: boolean;
  message: string;
  marketingConsent: boolean;
  submissionId: string | null;
  queueError: string | null;
  onOtpChange: (otp: string) => void;
  onBack: () => void;
  onSubmit: (code: string) => void;
  onSubmissionId: (id: string) => void;
  onQueueError: (error: string | null) => void;
  onCancelQueue: () => void;
};

function ContactOtpPanel({
  email,
  otp,
  error,
  loading,
  message,
  marketingConsent,
  submissionId,
  queueError,
  onOtpChange,
  onBack,
  onSubmit,
  onSubmissionId,
  onQueueError,
  onCancelQueue,
}: ContactOtpPanelProps) {
  const queuedRef = useRef(false);

  useEffect(() => {
    if (queuedRef.current) return;
    queuedRef.current = true;

    void (async () => {
      const id = await queueContact(email, message, marketingConsent);
      if (id === null) {
        onQueueError("We couldn't queue your message. Please go back and try again.");
        queuedRef.current = false;
        return;
      }
      onSubmissionId(id);
    })();
  }, [email, message, marketingConsent, onSubmissionId, onQueueError]);

  const handleBack = () => {
    if (submissionId !== null) {
      void cancelContactQueue(submissionId);
    }
    onCancelQueue();
    queuedRef.current = false;
    onBack();
  };

  return (
    <div className="mt-10 space-y-4">
      {queueError !== null && (
        <p className="text-sm text-red-400/90 md:text-[15px]" role="alert">
          {queueError}
        </p>
      )}
      <WaitlistOtpStep
        email={email}
        otp={otp}
        error={error}
        loading={loading}
        otpInputId="contact-otp"
        onOtpChange={onOtpChange}
        onBack={handleBack}
        onSubmit={onSubmit}
      />
    </div>
  );
}

export function ContactForm() {
  const submissionIdRef = useRef<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);

  const setSubmissionIdTracked = useCallback((value: SetStateAction<string | null>) => {
    setSubmissionId((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      submissionIdRef.current = next;
      return next;
    });
  }, []);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState<string | null>(null);

  const confirmSubmission = useCallback(async (id: string) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const ok = await confirmContact(id);
      if (ok) {
        logEvent("contact.message_submitted");
        setSubmitted(true);
        return;
      }
      setSubmitError("We couldn't deliver your message. Please try again.");
    } catch {
      setSubmitError("We couldn't deliver your message. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, []);

  if (submitted) {
    return (
      <p className="mt-10 text-sm text-[#F4F4EF]/85 md:text-[15px]" role="status">
        Thanks for your message.
      </p>
    );
  }

  if (submitting) {
    return (
      <div className="mt-10 flex items-center gap-3 text-sm text-[#F4F4EF]/85 md:text-[15px]">
        <Spinner className="text-[#F4F4EF]/50" />
        Sending your message…
      </div>
    );
  }

  if (submitError !== null && submissionId !== null) {
    return (
      <div className="mt-10 space-y-4">
        <p className="text-sm text-red-400/90 md:text-[15px]" role="alert">
          {submitError}
        </p>
        <Button
          type="button"
          variant="shell-outline"
          className="md:text-[15px]"
          onClick={() => void confirmSubmission(submissionId)}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <EmailConfirm.Root
      api={registryEmailConfirmApi}
      purpose="sign-up"
      otpLength={OTP_LENGTH}
      storageKey={CONTACT_STORAGE_KEY}
      marketing={{ listSlug: "khoralabs-updates", sourceApp: "khoralabs-homepage-contact" }}
      onSuccess={() => {
        void (async () => {
          const deadline = Date.now() + 10_000;
          while (submissionIdRef.current === null && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          const id = submissionIdRef.current;
          if (id !== null) {
            await confirmSubmission(id);
          }
        })();
      }}
    >
      <EmailConfirm.EmailStep>
        {(props) => (
          <form
            className="mt-10 flex flex-col gap-6 text-left"
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = message.trim();
              if (trimmed.length === 0) {
                setMessageError("Enter a message");
                return;
              }
              setMessageError(null);
              setMarketingConsent(props.marketingConsent);
              setSubmissionIdTracked(null);
              setQueueError(null);
              logEvent("contact.otp_requested");
              void props.sendOtp();
            }}
            aria-busy={props.loading}
          >
            <div className="flex flex-col gap-2">
              <label htmlFor="contact-email" className="text-sm md:text-[15px]">
                Email
              </label>
              <input
                id="contact-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                value={props.email}
                onChange={(e) => props.setEmail(e.target.value)}
                disabled={props.loading}
                className={inputClass}
                placeholder="you@example.com"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="contact-message" className="text-sm md:text-[15px]">
                Message
              </label>
              <textarea
                id="contact-message"
                name="message"
                required
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={props.loading}
                className={cn(inputClass, "resize-y")}
                placeholder="How can we help?"
              />
            </div>
            {props.showMarketingConsent ? (
              <Field
                orientation="horizontal"
                className="text-sm leading-[1.7] text-[#F4F4EF]/70 md:text-[15px]"
              >
                <Checkbox
                  id="contact-marketing"
                  checked={props.marketingConsent}
                  onCheckedChange={(checked) => props.setMarketingConsent(checked === true)}
                  disabled={props.loading}
                  className="size-4 border-[#F4F4EF]/20 bg-[#2a2a2a] data-[state=checked]:border-[#F4F4EF]/40 data-[state=checked]:bg-[#F4F4EF]/15"
                />
                <FieldLabel htmlFor="contact-marketing" className="font-normal leading-[1.7]">
                  Keep me updated about Khora news and product updates.
                </FieldLabel>
              </Field>
            ) : null}
            {messageError !== null && (
              <p className="text-sm text-red-400/90 md:text-[15px]">{messageError}</p>
            )}
            {props.error !== null && (
              <p className="text-sm text-red-400/90 md:text-[15px]">{props.error}</p>
            )}
            <Button
              type="submit"
              variant="shell-outline"
              disabled={props.loading}
              className="self-start md:text-[15px]"
            >
              Send
            </Button>
          </form>
        )}
      </EmailConfirm.EmailStep>
      <EmailConfirm.OtpStep>
        {(props) => (
          <ContactOtpPanel
            email={props.email}
            otp={props.otp}
            error={props.error}
            loading={props.loading}
            message={message.trim()}
            marketingConsent={marketingConsent}
            submissionId={submissionId}
            queueError={queueError}
            onOtpChange={props.setOtp}
            onBack={props.goBack}
            onSubmit={(code) => {
              logEvent("contact.otp_verified");
              void props.verifyOtp(code);
            }}
            onSubmissionId={setSubmissionIdTracked}
            onQueueError={setQueueError}
            onCancelQueue={() => {
              setSubmissionIdTracked(null);
              setQueueError(null);
            }}
          />
        )}
      </EmailConfirm.OtpStep>
    </EmailConfirm.Root>
  );
}
