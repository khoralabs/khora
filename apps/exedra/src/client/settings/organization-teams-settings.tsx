import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import type { MeTeam } from "@/lib/me-api";
import { fetchOrgTeams, type OrgTeamSummary } from "@/lib/settings-api";

type OrganizationTeamsSettingsProps = {
  activeTeam: MeTeam;
};

export function OrganizationTeamsSettings({ activeTeam }: OrganizationTeamsSettingsProps) {
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
          {teams.map((team) => (
            <li key={team.id} className="rounded-md border bg-background px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{team.name}</p>
                {team.id === activeTeam.id ? <Badge variant="secondary">Current</Badge> : null}
                <Badge variant="outline">
                  {team.memberCount} member{team.memberCount === 1 ? "" : "s"}
                </Badge>
              </div>
              <p className="mt-1 font-mono text-xs text-muted-foreground">{team.id}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
