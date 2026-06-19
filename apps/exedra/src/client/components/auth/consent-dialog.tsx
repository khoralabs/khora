import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";

export type ConsentDialogProps = {
  open: boolean;
  onAccept: (opts: { marketing: boolean }) => void | Promise<void>;
  showMarketingOptIn?: boolean;
  submitting?: boolean;
};

export function ConsentDialog({
  open,
  onAccept,
  showMarketingOptIn = true,
  submitting = false,
}: ConsentDialogProps) {
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [marketingAccepted, setMarketingAccepted] = useState(false);

  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        onPointerDownOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Before you continue</DialogTitle>
          <DialogDescription>
            Review and accept Exedra&apos;s terms to finish setting up your account.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field orientation="horizontal">
            <Checkbox
              id="exedra-consent-terms"
              checked={termsAccepted}
              onCheckedChange={(checked) => setTermsAccepted(checked === true)}
              disabled={submitting}
            />
            <FieldLabel htmlFor="exedra-consent-terms" className="font-normal">
              I agree to Exedra&apos;s{" "}
              <a href="/terms" target="_blank" rel="noreferrer" className="underline">
                Terms of Service
              </a>{" "}
              and{" "}
              <a href="/privacy" target="_blank" rel="noreferrer" className="underline">
                Privacy Policy
              </a>
              .
            </FieldLabel>
          </Field>

          {showMarketingOptIn ? (
            <Field orientation="horizontal">
              <Checkbox
                id="exedra-consent-marketing"
                checked={marketingAccepted}
                onCheckedChange={(checked) => setMarketingAccepted(checked === true)}
                disabled={submitting}
              />
              <FieldLabel htmlFor="exedra-consent-marketing" className="font-normal">
                Keep me updated with Khora news and product updates.
              </FieldLabel>
            </Field>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            disabled={!termsAccepted || submitting}
            onClick={() => void onAccept({ marketing: marketingAccepted })}
          >
            {submitting ? <Spinner className="size-4" aria-hidden /> : "Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
