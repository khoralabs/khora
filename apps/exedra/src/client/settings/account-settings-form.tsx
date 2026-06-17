import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { type MeResponse, type MeTeam, patchMeProfile } from "@/lib/me-api";
import { deleteMeAvatar, uploadMeAvatar } from "@/lib/settings-api";

import { AvatarUploadField, useAvatarPendingFile } from "./avatar-upload-field";

type AccountSettingsFormProps = {
  user: MeResponse["user"];
  activeTeam: MeTeam;
  onSaved: () => void;
};

export function AccountSettingsForm({ user, activeTeam, onSaved }: AccountSettingsFormProps) {
  const [fullName, setFullName] = useState(user.fullName ?? "");
  const [jobFunction, setJobFunction] = useState(user.jobFunction ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { pendingFile, removeRequested, selectFile, resetPending } = useAvatarPendingFile();

  useEffect(() => {
    setFullName(user.fullName ?? "");
    setJobFunction(user.jobFunction ?? "");
    setAvatarUrl(user.avatarUrl);
    resetPending();
  }, [user.fullName, user.jobFunction, user.avatarUrl, resetPending]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await patchMeProfile({ fullName, jobFunction });
      if (removeRequested && avatarUrl !== null) {
        const result = await deleteMeAvatar();
        setAvatarUrl(result.avatarUrl);
      } else if (pendingFile !== null) {
        const result = await uploadMeAvatar(activeTeam.orgId, pendingFile);
        setAvatarUrl(result.avatarUrl);
      }
      resetPending();
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save account settings");
    } finally {
      setSubmitting(false);
    }
  }

  const displayName = fullName.trim().length > 0 ? fullName : user.registryUserId;

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="mx-auto w-full max-w-lg">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="mt-1 text-sm text-muted-foreground">Update how you appear in Exedra.</p>
      </div>

      <FieldSet>
        <FieldGroup>
          <AvatarUploadField name={displayName} avatarUrl={avatarUrl} onFileSelected={selectFile} />
          <Field>
            <FieldLabel htmlFor="account-email">Email</FieldLabel>
            <Input id="account-email" value={user.registryUserId} disabled readOnly />
          </Field>
          <Field>
            <FieldLabel htmlFor="account-full-name">Full name</FieldLabel>
            <Input
              id="account-full-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Alex Morgan"
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

      {error !== null ? <FieldError className="mt-4">{error}</FieldError> : null}

      <div className="mt-6 flex justify-end">
        <Button type="submit" disabled={submitting}>
          {submitting ? <Spinner className="size-4" aria-hidden /> : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
