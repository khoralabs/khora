import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { type MeResponse, patchMeProfile } from "@/lib/me-api";

type AccountEditorDialogProps = {
  open: boolean;
  user: MeResponse["user"];
  onOpenChange: (open: boolean) => void;
  onSaved: (user: MeResponse["user"]) => void;
};

export function AccountEditorDialog({
  open,
  user,
  onOpenChange,
  onSaved,
}: AccountEditorDialogProps) {
  const [fullName, setFullName] = useState("");
  const [jobFunction, setJobFunction] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFullName(user.fullName ?? "");
    setJobFunction(user.jobFunction ?? "");
    setError(null);
    setSubmitting(false);
  }, [open, user.fullName, user.jobFunction]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const updated = await patchMeProfile({
        fullName,
        jobFunction,
      });
      onSaved(updated);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle>Account</DialogTitle>
          <DialogDescription>Update how you appear in Exedra.</DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void handleSubmit(event)} aria-busy={submitting}>
          <FieldSet>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="account-full-name">Full name</FieldLabel>
                <Input
                  id="account-full-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Alex Morgan"
                  autoFocus
                  disabled={submitting}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="account-job-function">Job function</FieldLabel>
                <Input
                  id="account-job-function"
                  value={jobFunction}
                  onChange={(e) => setJobFunction(e.target.value)}
                  placeholder="Product manager"
                  disabled={submitting}
                />
              </Field>
            </FieldGroup>
          </FieldSet>

          {error !== null ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Spinner className="size-4" aria-hidden /> : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
