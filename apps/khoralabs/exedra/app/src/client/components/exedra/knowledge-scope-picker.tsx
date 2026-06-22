import { Check, ChevronsUpDown, MessageSquare, Network, UserRound } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAnalytics } from "@/lib/analytics";
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
  activeTeam: MeTeam,
  sessions: SessionSummary[] | null,
): string {
  if (isPersonalGraphPath(pathname)) return "Personal knowledge";

  const teamGraphId = parseActiveTeamGraphId(pathname);
  if (teamGraphId !== null) {
    return `${activeTeam.name} · Team knowledge`;
  }

  const sessionGraphId = parseSessionGraphId(pathname);
  if (sessionGraphId !== null) {
    const session = sessions?.find((s) => s.id === sessionGraphId);
    const topic = session?.topic ?? "Session";
    return `${activeTeam.name} · ${topic}`;
  }

  return "Knowledge";
}

function triggerIcon(pathname: string) {
  if (isPersonalGraphPath(pathname)) return UserRound;
  if (parseSessionGraphId(pathname) !== null) return MessageSquare;
  return Network;
}

export function KnowledgeScopePicker({
  me: _me,
  activeTeam,
  sessions,
  pathname,
  onNavigate,
  variant = "header",
  collapsed = false,
}: KnowledgeScopePickerProps) {
  const track = useAnalytics();
  const personalActive = isPersonalGraphPath(pathname);
  const teamGraphId = parseActiveTeamGraphId(pathname);
  const sessionGraphId = parseSessionGraphId(pathname);
  const label = activeLabel(pathname, activeTeam, sessions);
  const isSidebar = variant === "sidebar";
  const TriggerIcon = triggerIcon(pathname);
  const teamSessions = sessions ?? [];

  const trigger = (
    <DropdownMenuTrigger asChild>
      {isSidebar ? (
        <button
          type="button"
          className={cn(
            "flex items-center gap-2 rounded-md text-left text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground",
            collapsed ? "justify-center px-2 py-2" : "w-full px-2 py-2",
          )}
          aria-label="Switch knowledge scope"
        >
          <TriggerIcon className="size-4 shrink-0" />
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
          className="flex max-w-64 items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-muted data-[state=open]:bg-muted"
          aria-label="Switch knowledge scope"
        >
          <TriggerIcon className="size-4 shrink-0 opacity-70" />
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
        className="min-w-64 rounded-lg"
        align={isSidebar ? "start" : "end"}
        side={isSidebar && collapsed ? "right" : "bottom"}
        sideOffset={4}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
            Personal
          </DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => {
              track("graph_opened", { scope: "personal" });
              onNavigate("/me/graph");
            }}
          >
            <UserRound className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">Personal knowledge</span>
            {personalActive ? <Check className="ml-auto size-4 shrink-0 text-primary" /> : null}
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
            {activeTeam.name}
          </DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => {
              track("graph_opened", { scope: "team" });
              onNavigate(`/teams/${activeTeam.id}/graph`);
            }}
          >
            <Network className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">Team knowledge</span>
            {teamGraphId === activeTeam.id ? (
              <Check className="ml-auto size-4 shrink-0 text-primary" />
            ) : null}
          </DropdownMenuItem>

          {teamSessions.length > 0 ? (
            <>
              <DropdownMenuLabel className="pl-6 text-[11px] font-normal uppercase tracking-wider text-muted-foreground/80">
                Sessions
              </DropdownMenuLabel>
              {teamSessions.map((session) => (
                <DropdownMenuItem
                  key={session.id}
                  className="pl-6"
                  onClick={() => {
                    track("graph_opened", { scope: "session", sessionId: session.id });
                    onNavigate(`/sessions/${session.id}/graph`);
                  }}
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
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
