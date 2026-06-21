import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Field, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { formatAccountDisplayName } from "@/lib/account-display";
import { fetchOrgMemberProfile } from "@/lib/settings-api";

import { AccountIdentityFields } from "./account-identity-fields";
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
        onTitleResolvedRef.current?.(formatAccountDisplayName(data.account));
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

  const displayName = formatAccountDisplayName(profile.account);

  return (
    <div className="mx-auto w-full max-w-lg">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Profile for <span className="font-medium text-foreground">{displayName}</span>.
        </p>
        {profile.context.isAdmin ? (
          <div className="mt-2">
            <Badge variant="outline">Admin</Badge>
          </div>
        ) : null}
      </div>

      <FieldSet>
        <FieldGroup>
          <AvatarUploadField
            name={displayName}
            avatarUrl={profile.account.avatarUrl}
            disabled
            onFileSelected={() => undefined}
          />
          <AccountIdentityFields email={profile.account.email} did={profile.account.userId} />
          <Field>
            <FieldLabel>Full name</FieldLabel>
            <p className="text-sm text-foreground break-all">{profile.account.fullName ?? "—"}</p>
          </Field>
          <Field>
            <FieldLabel>Job function</FieldLabel>
            <p className="text-sm text-foreground break-all">
              {profile.account.jobFunction ?? "—"}
            </p>
          </Field>
          <Field>
            <FieldLabel>Teams</FieldLabel>
            <p className="text-sm text-foreground break-all">
              {profile.context.teamNames.length > 0 ? profile.context.teamNames.join(", ") : "—"}
            </p>
          </Field>
        </FieldGroup>
      </FieldSet>
    </div>
  );
}
