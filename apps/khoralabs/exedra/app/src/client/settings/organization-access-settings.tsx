import { ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import {
  TeamItem,
  TeamItemBadges,
  TeamItemContent,
  TeamItemMedia,
  TeamItemTitle,
} from "@/components/team/team-item";
import { Spinner } from "@/components/ui/spinner";
import type { MeTeam } from "@/lib/me-api";
import { fetchOrgTeams, type OrgTeamSummary } from "@/lib/settings-api";
import { settingsOrgPath, settingsTeamPath } from "../shell/routes";

type OrganizationAccessSettingsProps = {
  activeTeam: MeTeam;
  onNavigate: (path: string) => void;
};

export function OrganizationAccessSettings({
  activeTeam,
  onNavigate,
}: OrganizationAccessSettingsProps) {
  const [teams, setTeams] = useState<OrgTeamSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchOrgTeams(activeTeam.orgId)
      .then((data) => {
        if (cancelled) return;
        setTeams(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load teams");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTeam.orgId]);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Access</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage who can do what in{" "}
          <span className="font-medium text-foreground">{activeTeam.orgName}</span>. Permissions are
          granted to teams and apply to every member.
        </p>
      </div>

      <section className="rounded-lg border bg-muted/30 p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground">How access works</p>
            <p className="mt-1">
              Each team carries a set of grants. Members inherit their team's permissions. Open a
              team to review or change its organization and team-level grants.
            </p>
          </div>
        </div>
      </section>

      <h2 className="mt-8 text-lg font-semibold tracking-tight">Teams</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Jump to a team's permissions to adjust its grants.
      </p>

      {error !== null ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

      <div className="mt-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner className="size-5" />
          </div>
        ) : teams.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No teams yet.{" "}
            <button
              type="button"
              className="underline transition-colors hover:text-foreground"
              onClick={() => onNavigate(settingsOrgPath("teams"))}
            >
              Create one
            </button>
            .
          </p>
        ) : (
          <ul className="space-y-2">
            {teams.map((row) => (
              <li key={row.team.id}>
                <TeamItem
                  team={row.team}
                  isCurrentTeam={row.team.id === activeTeam.id}
                  variant="outline"
                  size="sm"
                  asChild
                >
                  <button
                    type="button"
                    className="w-full cursor-pointer hover:bg-accent"
                    onClick={() => onNavigate(settingsTeamPath(row.team.id, "permissions"))}
                  >
                    <TeamItemMedia />
                    <TeamItemContent>
                      <TeamItemTitle />
                      <TeamItemBadges
                        badges={[
                          `${row.context.memberCount} member${row.context.memberCount === 1 ? "" : "s"}`,
                        ]}
                      />
                    </TeamItemContent>
                  </button>
                </TeamItem>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
