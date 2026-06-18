import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Field, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { fetchOrgMemberProfile } from "@/lib/settings-api";

import { AvatarUploadField } from "./avatar-upload-field";

type UserAccountSettingsProps = {
  orgId: string;
  userId: string;
  onNavigateToOwnAccount: () => void;
  onTitleResolved?: (title: string) => void;
};

export function UserAccountSettings({
  orgId,
  userId,
  onNavigateToOwnAccount,
  onTitleResolved,
}: UserAccountSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof fetchOrgMemberProfile>> | null>(
    null,
  );

  // Keep latest callbacks in refs so the effect doesn't re-fire when they change identity.
  const onNavigateToOwnAccountRef = useRef(onNavigateToOwnAccount);
  onNavigateToOwnAccountRef.current = onNavigateToOwnAccount;
  const onTitleResolvedRef = useRef(onTitleResolved);
  onTitleResolvedRef.current = onTitleResolved;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchOrgMemberProfile(orgId, userId)
      .then((data) => {
        if (cancelled) return;
        if (data.isCurrentUser) {
          onNavigateToOwnAccountRef.current();
          return;
        }
        setProfile(data);
        const name =
          data.user.fullName !== null && data.user.fullName.trim().length > 0
            ? data.user.fullName
            : data.user.registryUserId;
        onTitleResolvedRef.current?.(name);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load account");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, userId]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (error !== null || profile === null) {
    return <p className="text-sm text-destructive">{error ?? "Member not found"}</p>;
  }

  const displayName =
    profile.user.fullName !== null && profile.user.fullName.trim().length > 0
      ? profile.user.fullName
      : profile.user.registryUserId;

  return (
    <div className="mx-auto w-full max-w-lg">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Profile for <span className="font-medium text-foreground">{displayName}</span>.
        </p>
        {profile.isAdmin ? (
          <div className="mt-2">
            <Badge variant="outline">Admin</Badge>
          </div>
        ) : null}
      </div>

      <FieldSet>
        <FieldGroup>
          <AvatarUploadField
            name={displayName}
            avatarUrl={profile.user.avatarUrl}
            disabled
            onFileSelected={() => undefined}
          />
          <Field>
            <FieldLabel htmlFor="member-email">Email</FieldLabel>
            <Input id="member-email" value={profile.user.registryUserId} disabled readOnly />
          </Field>
          <Field>
            <FieldLabel htmlFor="member-full-name">Full name</FieldLabel>
            <Input id="member-full-name" value={profile.user.fullName ?? ""} disabled readOnly />
          </Field>
          <Field>
            <FieldLabel htmlFor="member-job-function">Job function</FieldLabel>
            <Input
              id="member-job-function"
              value={profile.user.jobFunction ?? ""}
              disabled
              readOnly
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="member-teams">Teams</FieldLabel>
            <Input
              id="member-teams"
              value={profile.teamNames.length > 0 ? profile.teamNames.join(", ") : "—"}
              disabled
              readOnly
            />
          </Field>
        </FieldGroup>
      </FieldSet>
    </div>
  );
}
