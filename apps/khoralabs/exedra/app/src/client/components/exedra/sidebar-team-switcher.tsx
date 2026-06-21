import { Check, ChevronsUpDown, Plus, Settings2 } from "lucide-react";

import { EntityAvatar } from "@/components/entity-avatar";
import {
  TeamItem,
  TeamItemContent,
  TeamItemMedia,
  TeamItemTitle,
} from "@/components/team/team-item";
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

import { SidebarCollapsedTooltip } from "./sidebar-collapsed-tooltip";

type SidebarTeamSwitcherProps = {
  teams: MeTeam[];
  activeTeam: MeTeam;
  collapsed: boolean;
  onTeamChange: (team: MeTeam) => void;
  onCreateTeam?: () => void;
  onManageTeams?: () => void;
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
      <EntityAvatar
        name={team.name}
        avatarUrl={team.avatarUrl}
        className="size-6 rounded-md [&_[data-slot=avatar-fallback]]:rounded-md"
      />
      {!collapsed ? (
        <>
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-sm font-medium",
              team.id.length === 0 && "text-muted-foreground",
            )}
          >
            {team.name}
          </span>
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
  onManageTeams,
}: SidebarTeamSwitcherProps) {
  const displayTeam = teams.length === 0 ? ONBOARDING_PLACEHOLDER_TEAM : activeTeam;

  if (teams.length === 0) {
    return (
      <SidebarCollapsedTooltip collapsed={collapsed} label="Select a team">
        <div
          className={cn(
            "flex items-center gap-2 rounded-md p-2 text-left text-sm",
            collapsed ? "justify-center px-2" : "min-w-0 w-full",
          )}
        >
          <TeamSwitcherDisplay team={displayTeam} collapsed={collapsed} showChevron={false} />
        </div>
      </SidebarCollapsedTooltip>
    );
  }

  return (
    <div className={cn(!collapsed && "w-full min-w-0")}>
      <DropdownMenu>
        <SidebarCollapsedTooltip collapsed={collapsed} label={activeTeam.name}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex items-center gap-2 rounded-md p-2 text-left text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground",
                collapsed ? "justify-center px-2" : "min-w-0 w-full",
              )}
              aria-label={activeTeam.name}
            >
              <TeamSwitcherDisplay team={activeTeam} collapsed={collapsed} showChevron />
            </button>
          </DropdownMenuTrigger>
        </SidebarCollapsedTooltip>
        <DropdownMenuContent
          className="min-w-56 rounded-lg"
          side={collapsed ? "right" : "bottom"}
          align="start"
          sideOffset={4}
        >
          <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider">
            Teams
          </DropdownMenuLabel>
          {teams.map((team) => (
            <DropdownMenuItem key={team.id} className="p-0" onClick={() => onTeamChange(team)}>
              <div className="flex w-full min-w-0 items-center gap-2 px-1 py-1.5">
                <TeamItem team={team} size="sm" className="min-w-0 flex-1 border-none p-0">
                  <TeamItemMedia />
                  <TeamItemContent>
                    <TeamItemTitle />
                  </TeamItemContent>
                </TeamItem>
                {team.id === activeTeam.id ? (
                  <Check className="size-4 shrink-0 text-primary" />
                ) : null}
              </div>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          {onCreateTeam ? (
            <DropdownMenuItem
              className="gap-2 p-2"
              onSelect={(event) => {
                event.preventDefault();
                onCreateTeam();
              }}
            >
              <Plus className="size-4 shrink-0" />
              Create team
            </DropdownMenuItem>
          ) : null}
          {onManageTeams ? (
            <DropdownMenuItem
              className="gap-2 p-2"
              onSelect={(event) => {
                event.preventDefault();
                onManageTeams();
              }}
            >
              <Settings2 className="size-4 shrink-0" />
              Manage teams
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
