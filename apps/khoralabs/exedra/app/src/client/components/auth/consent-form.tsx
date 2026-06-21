import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";

type ConsentFormProps = {
  onAccept: (opts: { marketing: boolean }) => void | Promise<void>;
  submitting?: boolean;
};

export function ConsentForm({ onAccept, submitting = false }: ConsentFormProps) {
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [marketingAccepted, setMarketingAccepted] = useState(false);

  return (
    <FieldGroup className="gap-6">
      <div className="space-y-2">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">One more thing</h1>
        <p className="text-sm text-muted-foreground">
          Review and accept to finish setting up your account.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <Checkbox
            id="exedra-consent-terms"
            checked={termsAccepted}
            onCheckedChange={(checked) => setTermsAccepted(checked === true)}
            disabled={submitting}
            className="mt-0.5"
          />
          <label htmlFor="exedra-consent-terms" className="text-sm leading-relaxed">
            I agree to Exedra&apos;s{" "}
            <a href="/terms" target="_blank" rel="noreferrer" className="underline">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="/privacy" target="_blank" rel="noreferrer" className="underline">
              Privacy Policy
            </a>
            .
          </label>
        </div>

        <div className="flex items-start gap-3">
          <Checkbox
            id="exedra-consent-marketing"
            checked={marketingAccepted}
            onCheckedChange={(checked) => setMarketingAccepted(checked === true)}
            disabled={submitting}
            className="mt-0.5"
          />
          <label htmlFor="exedra-consent-marketing" className="text-sm leading-relaxed">
            Keep me updated with Khora news and product updates.
          </label>
        </div>
      </div>

      <Button
        disabled={!termsAccepted || submitting}
        onClick={() => void onAccept({ marketing: marketingAccepted })}
      >
        {submitting ? <Spinner className="size-4" aria-hidden /> : "Continue"}
      </Button>
    </FieldGroup>
  );
}
