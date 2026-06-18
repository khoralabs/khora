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
import { settingsTeamPath } from "../shell/routes";

type OrganizationTeamsSettingsProps = {
  activeTeam: MeTeam;
  onNavigate: (path: string) => void;
};

export function OrganizationTeamsSettings({
  activeTeam,
  onNavigate,
}: OrganizationTeamsSettingsProps) {
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
        <h1 className="text-2xl font-semibold tracking-tight">Teams</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          All teams in <span className="font-medium text-foreground">{activeTeam.orgName}</span>.
        </p>
      </div>

      {error !== null ? <p className="text-sm text-destructive">{error}</p> : null}

      {teams.length === 0 ? (
        <p className="text-sm text-muted-foreground">No teams yet.</p>
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
                  onClick={() => onNavigate(settingsTeamPath(row.team.id))}
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
  );
}
