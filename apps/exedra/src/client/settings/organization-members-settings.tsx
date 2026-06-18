import { OrgPermission } from "@shared/authz/permissions";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { MeTeam } from "@/lib/me-api";
import { fetchOrgMembers, fetchOrgSettings, type OrgMemberSummary } from "@/lib/settings-api";
import { settingsAccountPath, settingsMemberPath } from "../shell/routes";

import { InviteMemberDialog } from "./invite-member-dialog";
import { MembersTable } from "./members-table";

type OrganizationMembersSettingsProps = {
  activeTeam: MeTeam;
  onNavigate: (path: string) => void;
};

export function OrganizationMembersSettings({
  activeTeam,
  onNavigate,
}: OrganizationMembersSettingsProps) {
  const [members, setMembers] = useState<OrgMemberSummary[]>([]);
  const [canInvite, setCanInvite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void Promise.all([fetchOrgMembers(activeTeam.orgId), fetchOrgSettings(activeTeam.orgId)])
      .then(([memberData, orgSettings]) => {
        if (cancelled) return;
        setMembers(memberData);
        setCanInvite(orgSettings.permissions?.[OrgPermission.MemberManage] === true);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load members");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTeam.orgId]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="size-6" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everyone in <span className="font-medium text-foreground">{activeTeam.orgName}</span>{" "}
            across all teams.
          </p>
        </div>
        {canInvite ? (
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <Plus />
            Member
          </Button>
        ) : null}
      </div>

      {error !== null ? <p className="text-sm text-destructive">{error}</p> : null}

      <MembersTable
        members={members}
        onMemberClick={(userId) => {
          const member = members.find((row) => row.account.userId === userId);
          onNavigate(member?.isCurrentUser ? settingsAccountPath() : settingsMemberPath(userId));
        }}
      />

      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        variant="org"
        orgId={activeTeam.orgId}
        orgName={activeTeam.orgName}
      />
    </div>
  );
}
