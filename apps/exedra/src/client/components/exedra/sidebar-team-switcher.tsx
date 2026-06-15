import { Building2, ChevronsUpDown, Plus, Users } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type MeTeam, ONBOARDING_PLACEHOLDER_TEAM } from "@/lib/me-api";
import { cn } from "@/lib/utils";

type SidebarTeamSwitcherProps = {
  teams: MeTeam[];
  activeTeam: MeTeam;
  collapsed: boolean;
  onTeamChange: (team: MeTeam) => void;
  onCreateTeam?: () => void;
};

function TeamSwitcherDisplay({
  team,
  collapsed,
  showChevron,
}: {
  team: MeTeam;
  collapsed: boolean;
  showChevron: boolean;
}) {
  return (
    <>
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
        <Building2 className="size-4" />
      </div>
      {!collapsed ? (
        <>
          <div className="grid min-w-0 flex-1 leading-tight">
            <span
              className={cn(
                "truncate font-medium",
                team.id.length === 0 && "text-muted-foreground",
              )}
            >
              {team.orgName}
            </span>
            <span className="truncate text-xs text-muted-foreground">{team.name}</span>
          </div>
          {showChevron ? <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50" /> : null}
        </>
      ) : null}
    </>
  );
}

export function SidebarTeamSwitcher({
  teams,
  activeTeam,
  collapsed,
  onTeamChange,
  onCreateTeam,
}: SidebarTeamSwitcherProps) {
  const displayTeam = teams.length === 0 ? ONBOARDING_PLACEHOLDER_TEAM : activeTeam;

  if (teams.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-md p-2 text-left text-sm",
          collapsed ? "justify-center px-2" : "min-w-0 flex-1",
        )}
        title={collapsed ? `${displayTeam.orgName} · ${displayTeam.name}` : undefined}
      >
        <TeamSwitcherDisplay team={displayTeam} collapsed={collapsed} showChevron={false} />
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-2 rounded-md p-2 text-left text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground",
            collapsed ? "justify-center px-2" : "min-w-0 flex-1",
          )}
          title={collapsed ? `${activeTeam.orgName} · ${activeTeam.name}` : undefined}
        >
          <TeamSwitcherDisplay team={activeTeam} collapsed={collapsed} showChevron />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="min-w-56 rounded-lg"
        side={collapsed ? "right" : "bottom"}
        align="start"
        sideOffset={4}
      >
        <DropdownMenuLabel className="text-xs text-muted-foreground">Teams</DropdownMenuLabel>
        {teams.map((team) => (
          <DropdownMenuItem key={team.id} className="gap-2 p-2" onClick={() => onTeamChange(team)}>
            <div className="flex size-6 items-center justify-center rounded-md border">
              <Users className="size-3.5 shrink-0" />
            </div>
            <span className="truncate font-medium">{team.name}</span>
          </DropdownMenuItem>
        ))}
        {onCreateTeam ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 p-2"
              onSelect={(event) => {
                event.preventDefault();
                onCreateTeam();
              }}
            >
              <Plus className="size-4 shrink-0" />
              Team
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
