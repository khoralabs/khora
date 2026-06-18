import { Check, ChevronsUpDown, MessageSquare, Network, UserRound } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MeResponse, MeTeam } from "@/lib/me-api";
import type { SessionSummary } from "@/lib/sessions-api";
import { cn } from "@/lib/utils";
import { isPersonalGraphPath, parseActiveTeamGraphId, parseSessionGraphId } from "@/shell/routes";

import { SidebarCollapsedTooltip } from "./sidebar-collapsed-tooltip";

type KnowledgeScopePickerProps = {
  me: MeResponse;
  activeTeam: MeTeam;
  sessions: SessionSummary[] | null;
  pathname: string;
  onNavigate: (path: string) => void;
  variant?: "header" | "sidebar";
  collapsed?: boolean;
};

function activeLabel(
  pathname: string,
  me: MeResponse,
  activeTeam: MeTeam,
  sessions: SessionSummary[] | null,
): string {
  if (isPersonalGraphPath(pathname)) return "Personal knowledge";

  const teamGraphId = parseActiveTeamGraphId(pathname);
  if (teamGraphId !== null) {
    const team = me.teams.find((t) => t.id === teamGraphId) ?? activeTeam;
    return `${team.name} knowledge`;
  }

  const sessionGraphId = parseSessionGraphId(pathname);
  if (sessionGraphId !== null) {
    const session = sessions?.find((s) => s.id === sessionGraphId);
    return session?.topic ?? "Session knowledge";
  }

  return "Knowledge";
}

export function KnowledgeScopePicker({
  me,
  activeTeam,
  sessions,
  pathname,
  onNavigate,
  variant = "header",
  collapsed = false,
}: KnowledgeScopePickerProps) {
  const personalActive = isPersonalGraphPath(pathname);
  const teamGraphId = parseActiveTeamGraphId(pathname);
  const sessionGraphId = parseSessionGraphId(pathname);
  const label = activeLabel(pathname, me, activeTeam, sessions);
  const isSidebar = variant === "sidebar";

  const trigger = (
    <DropdownMenuTrigger asChild>
      {isSidebar ? (
        <button
          type="button"
          className={cn(
            "flex items-center gap-2 rounded-md text-left text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground",
            collapsed ? "justify-center px-2 py-2" : "w-full px-3 py-2",
          )}
          aria-label="Switch knowledge scope"
        >
          <Network className="size-4 shrink-0" />
          {!collapsed ? (
            <>
              <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
              <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50" />
            </>
          ) : null}
        </button>
      ) : (
        <button
          type="button"
          className="flex max-w-56 items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-muted data-[state=open]:bg-muted"
          aria-label="Switch knowledge scope"
        >
          <Network className="size-4 shrink-0 opacity-70" />
          <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
          <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50" />
        </button>
      )}
    </DropdownMenuTrigger>
  );

  return (
    <DropdownMenu>
      {isSidebar ? (
        <SidebarCollapsedTooltip collapsed={collapsed} label={label}>
          {trigger}
        </SidebarCollapsedTooltip>
      ) : (
        trigger
      )}
      <DropdownMenuContent
        className="min-w-56 rounded-lg"
        align={isSidebar ? "start" : "end"}
        side={isSidebar && collapsed ? "right" : "bottom"}
        sideOffset={4}
      >
        <DropdownMenuItem onClick={() => onNavigate("/me/graph")}>
          <UserRound className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">Personal knowledge</span>
          {personalActive ? <Check className="ml-auto size-4 shrink-0 text-primary" /> : null}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onNavigate(`/teams/${activeTeam.id}/graph`)}>
          <Network className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{activeTeam.name} knowledge</span>
          {teamGraphId === activeTeam.id ? (
            <Check className="ml-auto size-4 shrink-0 text-primary" />
          ) : null}
        </DropdownMenuItem>

        {sessions !== null && sessions.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">
              Sessions
            </DropdownMenuLabel>
            {sessions.map((session) => (
              <DropdownMenuItem
                key={session.id}
                onClick={() => onNavigate(`/sessions/${session.id}/graph`)}
              >
                <MessageSquare className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{session.topic}</span>
                {session.id === sessionGraphId ? (
                  <Check className="ml-auto size-4 shrink-0 text-primary" />
                ) : null}
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
