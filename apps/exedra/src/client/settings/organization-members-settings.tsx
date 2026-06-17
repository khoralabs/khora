import { useEffect, useState } from "react";

import { Spinner } from "@/components/ui/spinner";
import type { MeTeam } from "@/lib/me-api";
import { fetchOrgMembers, type OrgMemberSummary } from "@/lib/settings-api";

import { MembersTable } from "./members-table";

type OrganizationMembersSettingsProps = {
  activeTeam: MeTeam;
};

export function OrganizationMembersSettings({ activeTeam }: OrganizationMembersSettingsProps) {
  const [members, setMembers] = useState<OrgMemberSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchOrgMembers(activeTeam.orgId)
      .then((data) => {
        if (cancelled) return;
        setMembers(data);
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
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone in <span className="font-medium text-foreground">{activeTeam.orgName}</span>{" "}
          across all teams.
        </p>
      </div>

      {error !== null ? <p className="text-sm text-destructive">{error}</p> : null}

      <MembersTable
        members={members.map((member) => ({
          ...member,
          badges: member.isOwner ? ["Owner"] : [],
          subtitle:
            member.teamNames.length > 0 ? `Teams: ${member.teamNames.join(", ")}` : undefined,
        }))}
      />
    </div>
  );
}
