import { OrgPermission, TeamPermission } from "@shared/authz/permissions";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { EntitlementGate } from "@/components/authz/entitlement-gate";
import { PermissionsProvider } from "@/components/authz/permissions-context";
import { PermissionsManagement } from "@/components/authz/permissions-management";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchTeamPermissions, type TeamGrantsSnapshot } from "@/lib/permissions-api";
import {
  deleteTeamAvatar,
  fetchOrgSettings,
  fetchTeamMembers,
  fetchTeamSettings,
  patchTeamSettings,
  type TeamMemberSummary,
  type TeamSettings,
  uploadTeamAvatar,
} from "@/lib/settings-api";

import { settingsMemberPath, settingsTeamPath, type TeamSubArea } from "../shell/routes";
import { AvatarUploadField, useAvatarPendingFile } from "./avatar-upload-field";
import { InviteMemberDialog } from "./invite-member-dialog";
import { MembersTable } from "./members-table";

type TeamSettingsFormProps = {
  teamId: string;
  subArea: TeamSubArea;
  onSaved: () => void;
  onNavigate: (path: string) => void;
  onTitleResolved?: (title: string) => void;
};

export function TeamSettingsForm({
  teamId,
  subArea,
  onSaved,
  onNavigate,
  onTitleResolved,
}: TeamSettingsFormProps) {
  const [settings, setSettings] = useState<TeamSettings | null>(null);
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [members, setMembers] = useState<TeamMemberSummary[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [viewerOrgPermissions, setViewerOrgPermissions] = useState<
    Record<string, boolean> | undefined
  >(undefined);
  const [teamGrants, setTeamGrants] = useState<TeamGrantsSnapshot | null>(null);
  const [teamGrantsLoading, setTeamGrantsLoading] = useState(true);
  const [teamGrantsError, setTeamGrantsError] = useState<string | null>(null);
  const { pendingFile, removeRequested, selectFile, resetPending } = useAvatarPendingFile();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchTeamSettings(teamId)
      .then((data) => {
        if (cancelled) return;
        setSettings(data);
        setName(data.name);
        setAvatarUrl(data.avatarUrl);
        onTitleResolved?.(data.name);
        resetPending();
        setLoading(false);
        if (data.orgId.length > 0) {
          void fetchOrgSettings(data.orgId)
            .then((orgSettings) => {
              if (cancelled) return;
              setViewerOrgPermissions(orgSettings.permissions);
            })
            .catch(() => undefined);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load settings");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [teamId, resetPending, onTitleResolved]);

  useEffect(() => {
    let cancelled = false;
    setMembersLoading(true);
    void fetchTeamMembers(teamId)
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
  }, [teamId]);

  useEffect(() => {
    let cancelled = false;
    setTeamGrantsLoading(true);
    setTeamGrantsError(null);
    void fetchTeamPermissions(teamId)
      .then((data) => {
        if (cancelled) return;
        setTeamGrants(data);
        setTeamGrantsLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setTeamGrants(null);
        setTeamGrantsError(err instanceof Error ? err.message : "Failed to load team permissions");
        setTeamGrantsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (settings === null || !settings.canEdit) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await patchTeamSettings(teamId, { name });
      let next = updated;
      if (removeRequested && avatarUrl !== null) {
        next = await deleteTeamAvatar(teamId);
      } else if (pendingFile !== null) {
        next = await uploadTeamAvatar(teamId, pendingFile);
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

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="size-6" />
      </div>
    );
  }

  const canEdit = settings?.canEdit ?? false;
  const canInvite = settings?.permissions?.[TeamPermission.MemberManage] === true;

  return (
    <PermissionsProvider value={{ org: viewerOrgPermissions, team: settings?.permissions }}>
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{settings?.name ?? teamId}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Team settings.</p>
        </div>

        <Tabs
          value={subArea}
          onValueChange={(value) => onNavigate(settingsTeamPath(teamId, value as TeamSubArea))}
        >
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
            <EntitlementGate scope="org" permission={OrgPermission.PermissionsManage}>
              <TabsTrigger value="permissions">Permissions</TabsTrigger>
            </EntitlementGate>
          </TabsList>

          <TabsContent value="general" className="mt-6">
            <form onSubmit={(event) => void handleSubmit(event)}>
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
          </TabsContent>

          <TabsContent value="members" className="mt-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Members</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Everyone with access to this team.
                </p>
              </div>
              {canInvite ? (
                <Button size="sm" onClick={() => setInviteOpen(true)}>
                  <Plus />
                  Member
                </Button>
              ) : null}
            </div>
            <div className="mt-4">
              {membersLoading ? (
                <div className="flex justify-center py-8">
                  <Spinner className="size-4" />
                </div>
              ) : (
                <MembersTable
                  members={members}
                  onMemberClick={(memberId) => onNavigate(settingsMemberPath(memberId))}
                />
              )}
            </div>
          </TabsContent>

          <TabsContent value="permissions" className="mt-6">
            <EntitlementGate
              scope="org"
              permission={OrgPermission.PermissionsManage}
              fallback={
                <p className="text-sm text-muted-foreground">
                  You don't have access to manage permissions for this team.
                </p>
              }
            >
              <div className="space-y-10">
                <PermissionsManagement
                  teamId={teamId}
                  grantScope="org"
                  teamName={settings?.name}
                  grants={teamGrants}
                  grantsLoading={teamGrantsLoading}
                  grantsError={teamGrantsError}
                  onGrantsUpdated={setTeamGrants}
                />
                <PermissionsManagement
                  teamId={teamId}
                  grantScope="team"
                  teamName={settings?.name}
                  grants={teamGrants}
                  grantsLoading={teamGrantsLoading}
                  grantsError={teamGrantsError}
                  onGrantsUpdated={setTeamGrants}
                />
              </div>
            </EntitlementGate>
          </TabsContent>
        </Tabs>

        {settings !== null ? (
          <InviteMemberDialog
            open={inviteOpen}
            onOpenChange={setInviteOpen}
            variant="team"
            teamId={teamId}
            teamName={settings.name}
          />
        ) : null}
      </div>
    </PermissionsProvider>
  );
}
