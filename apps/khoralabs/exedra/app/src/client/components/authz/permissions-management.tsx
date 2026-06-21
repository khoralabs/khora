import {
  ORG_PERMISSION_META,
  ORG_PERMISSIONS,
  type OrgPermission,
  TEAM_PERMISSION_META,
  TEAM_PERMISSIONS,
  type TeamPermission,
} from "@shared/authz/permissions";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import {
  fetchTeamPermissions,
  patchTeamPermissions,
  type TeamGrantsSnapshot,
} from "@/lib/permissions-api";

type PermissionsManagementProps = {
  teamId: string;
  grantScope: "org" | "team";
  teamName?: string;
  grants?: TeamGrantsSnapshot | null;
  grantsLoading?: boolean;
  grantsError?: string | null;
  onGrantsUpdated?: (grants: TeamGrantsSnapshot) => void;
};

export function PermissionsManagement({
  teamId,
  grantScope,
  teamName,
  grants = null,
  grantsLoading = false,
  grantsError = null,
  onGrantsUpdated,
}: PermissionsManagementProps) {
  const [loading, setLoading] = useState(grants === null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (grants !== null) {
      const slice = grantScope === "org" ? grants.org : grants.team;
      setCanEdit(grants.canEdit);
      setSelected(slice.granted);
      setLoading(false);
      setError(grantsError);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchTeamPermissions(teamId)
      .then((data) => {
        if (cancelled) return;
        const slice = grantScope === "org" ? data.org : data.team;
        setCanEdit(data.canEdit);
        setSelected(slice.granted);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load permissions");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [teamId, grantScope, grants, grantsError]);

  async function handleSave() {
    setSubmitting(true);
    setError(null);
    try {
      const data = await patchTeamPermissions(
        teamId,
        grantScope,
        grantScope === "org" ? (selected as OrgPermission[]) : (selected as TeamPermission[]),
      );
      const slice = grantScope === "org" ? data.org : data.team;
      setSelected(slice.granted);
      setCanEdit(data.canEdit);
      onGrantsUpdated?.(data);
      toast.success("Permissions saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save permissions");
    } finally {
      setSubmitting(false);
    }
  }

  function togglePermission(permission: string, checked: boolean) {
    if (!canEdit || submitting) return;
    setSelected((current) =>
      checked ? [...current, permission] : current.filter((item) => item !== permission),
    );
  }

  if (loading || grantsLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner className="size-4" />
      </div>
    );
  }

  const permissions = grantScope === "org" ? ORG_PERMISSIONS : TEAM_PERMISSIONS;
  const meta = grantScope === "org" ? ORG_PERMISSION_META : TEAM_PERMISSION_META;
  const scopeLabel =
    grantScope === "org"
      ? "Organization"
      : teamName !== undefined && teamName.length > 0
        ? teamName
        : "Team";
  const displayError = error ?? grantsError;

  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">{scopeLabel} permissions</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Grants apply to every member of this team.
      </p>

      {displayError !== null ? <FieldError className="mt-4">{displayError}</FieldError> : null}

      <FieldSet className="mt-4">
        <FieldGroup data-slot="checkbox-group">
          {permissions.map((permission) => {
            const info = meta[permission as OrgPermission & TeamPermission];
            const inputId = `${grantScope}-${teamId}-${permission}`;
            const active = selected.includes(permission);
            return (
              <Field
                key={permission}
                orientation="horizontal"
                data-disabled={!canEdit || submitting}
              >
                <Checkbox
                  id={inputId}
                  checked={active}
                  disabled={!canEdit || submitting}
                  onCheckedChange={(checked) => togglePermission(permission, checked === true)}
                />
                <FieldContent>
                  <FieldLabel htmlFor={inputId}>{info.label}</FieldLabel>
                  <FieldDescription className="text-xs text-muted-foreground font-mono">
                    {info.description}
                  </FieldDescription>
                </FieldContent>
              </Field>
            );
          })}
        </FieldGroup>
      </FieldSet>

      {canEdit ? (
        <div className="mt-4 flex justify-end">
          <Button type="button" disabled={submitting} onClick={() => void handleSave()}>
            {submitting ? <Spinner className="size-4" aria-hidden /> : "Save permissions"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
