import { Link2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { copyTextToClipboard } from "@/lib/copy-text";
import { INVITE_LINK_SINGLE_USE_NOTE } from "@/lib/invite-copy";
import { type MeTeam, mintTeamInvite } from "@/lib/me-api";
import {
  deleteTeamAvatar,
  fetchTeamMembers,
  fetchTeamSettings,
  patchTeamSettings,
  type TeamMemberSummary,
  type TeamSettings,
  uploadTeamAvatar,
} from "@/lib/settings-api";

import { AvatarUploadField, useAvatarPendingFile } from "./avatar-upload-field";
import { MembersTable } from "./members-table";

type TeamSettingsFormProps = {
  activeTeam: MeTeam;
  onSaved: () => void;
};

export function TeamSettingsForm({ activeTeam, onSaved }: TeamSettingsFormProps) {
  const [settings, setSettings] = useState<TeamSettings | null>(null);
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [mintingInvite, setMintingInvite] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [members, setMembers] = useState<TeamMemberSummary[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const { pendingFile, removeRequested, selectFile, resetPending } = useAvatarPendingFile();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchTeamSettings(activeTeam.id)
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
  }, [activeTeam.id, resetPending]);

  useEffect(() => {
    let cancelled = false;
    setMembersLoading(true);
    void fetchTeamMembers(activeTeam.id)
      .then((data) => {
        if (cancelled) return;
        setMembers(data);
        setMembersLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setMembers([]);
        setMembersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTeam.id]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (settings === null || !settings.canEdit) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await patchTeamSettings(activeTeam.id, { name });
      let next = updated;
      if (removeRequested && avatarUrl !== null) {
        next = await deleteTeamAvatar(activeTeam.id);
      } else if (pendingFile !== null) {
        next = await uploadTeamAvatar(activeTeam.id, pendingFile);
      }
      setSettings(next);
      setName(next.name);
      setAvatarUrl(next.avatarUrl);
      resetPending();
      onSaved();
      toast.success("Team settings saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save team settings");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMintInvite() {
    setMintingInvite(true);
    setError(null);
    try {
      const result = await mintTeamInvite(activeTeam.id);
      const url = `${window.location.origin}${result.url}`;
      setInviteUrl(url);
      setInviteCopied(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create invite link");
    } finally {
      setMintingInvite(false);
    }
  }

  async function handleCopyInvite() {
    if (inviteUrl === null) return;
    await copyTextToClipboard(inviteUrl);
    setInviteCopied(true);
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
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Settings for <span className="font-medium text-foreground">{activeTeam.name}</span>.
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
            <FieldLabel htmlFor="team-name">Name</FieldLabel>
            <Input
              id="team-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canEdit || submitting}
            />
          </Field>
          <Field>
            <FieldLabel>Invite link</FieldLabel>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={mintingInvite}
                onClick={() => void handleMintInvite()}
              >
                {mintingInvite ? <Spinner className="size-4" aria-hidden /> : <Link2 />}
                Create invite link
              </Button>
              {inviteUrl !== null ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleCopyInvite()}
                >
                  {inviteCopied ? "Copied" : "Copy link"}
                </Button>
              ) : null}
            </div>
            {inviteUrl !== null ? (
              <FieldDescription className="truncate">{inviteUrl}</FieldDescription>
            ) : null}
            <FieldDescription>{INVITE_LINK_SINGLE_USE_NOTE}</FieldDescription>
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

      <div className="mt-10 border-t pt-8">
        <h2 className="text-lg font-semibold tracking-tight">Members</h2>
        <p className="mt-1 text-sm text-muted-foreground">Everyone with access to this team.</p>
        <div className="mt-4">
          {membersLoading ? (
            <div className="flex justify-center py-8">
              <Spinner className="size-4" />
            </div>
          ) : (
            <MembersTable members={members} />
          )}
        </div>
      </div>
    </form>
  );
}
