import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { MeTeam } from "@/lib/me-api";
import {
  deleteOrgAvatar,
  type EntitySettings,
  fetchOrgSettings,
  patchOrgSettings,
  uploadOrgAvatar,
} from "@/lib/settings-api";

import { AvatarUploadField, useAvatarPendingFile } from "./avatar-upload-field";

type OrganizationSettingsFormProps = {
  activeTeam: MeTeam;
  onSaved: () => void;
};

export function OrganizationSettingsForm({ activeTeam, onSaved }: OrganizationSettingsFormProps) {
  const [settings, setSettings] = useState<EntitySettings | null>(null);
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { pendingFile, removeRequested, selectFile, resetPending } = useAvatarPendingFile();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchOrgSettings(activeTeam.orgId)
      .then((data) => {
        if (cancelled) return;
        setSettings(data);
        setName(data.name);
        setAvatarUrl(data.avatarUrl);
        resetPending();
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load settings");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTeam.orgId, resetPending]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (settings === null || !settings.canEdit) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await patchOrgSettings(activeTeam.orgId, { name });
      let next = updated;
      if (removeRequested && avatarUrl !== null) {
        next = await deleteOrgAvatar(activeTeam.orgId);
      } else if (pendingFile !== null) {
        next = await uploadOrgAvatar(activeTeam.orgId, pendingFile);
      }
      setSettings(next);
      setName(next.name);
      setAvatarUrl(next.avatarUrl);
      resetPending();
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save organization settings");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="size-6" />
      </div>
    );
  }

  const canEdit = settings?.canEdit ?? false;

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="mx-auto w-full max-w-lg">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Organization</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your organization&apos;s profile.
        </p>
      </div>

      <FieldSet>
        <FieldGroup>
          <AvatarUploadField
            name={name}
            avatarUrl={avatarUrl}
            disabled={!canEdit || submitting}
            onFileSelected={selectFile}
          />
          <Field>
            <FieldLabel htmlFor="org-name">Name</FieldLabel>
            <Input
              id="org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canEdit || submitting}
            />
          </Field>
        </FieldGroup>
      </FieldSet>

      {error !== null ? <FieldError className="mt-4">{error}</FieldError> : null}

      {canEdit ? (
        <div className="mt-6 flex justify-end">
          <Button type="submit" disabled={submitting}>
            {submitting ? <Spinner className="size-4" aria-hidden /> : "Save changes"}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
