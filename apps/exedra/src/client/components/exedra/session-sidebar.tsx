import { CalendarPlus, PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";

import { SidebarTeamSwitcher } from "@/components/exedra/sidebar-team-switcher";
import { formatSidebarUser, SidebarUserMenu } from "@/components/exedra/sidebar-user-menu";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { MeResponse, MeTeam } from "@/lib/me-api";
import type { SessionSummary } from "@/lib/sessions-api";
import { cn } from "@/lib/utils";

type SessionSidebarProps = {
  me: MeResponse;
  teams: MeTeam[];
  activeTeam: MeTeam;
  sessions: SessionSummary[] | null;
  activeSessionId: string | null;
  collapsed: boolean;
  onboardingRequired?: boolean;
  onToggleCollapsed: () => void;
  onTeamChange: (team: MeTeam) => void;
  onCreateSession: () => void;
  onCreateTeam?: () => void;
  onSelectSession: (sessionId: string) => void;
  onOpenAccountSettings?: () => void;
  onSignOut?: () => void;
};

export function SessionSidebar({
  me,
  teams,
  activeTeam,
  sessions,
  activeSessionId,
  collapsed,
  onboardingRequired = false,
  onToggleCollapsed,
  onTeamChange,
  onCreateSession,
  onCreateTeam,
  onSelectSession,
  onOpenAccountSettings,
  onSignOut,
}: SessionSidebarProps) {
  const user = formatSidebarUser(me.user);

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200",
        collapsed ? "w-14" : "w-64",
      )}
    >
      <div className={cn("border-b p-2", collapsed ? "px-2" : "px-3")}>
        <div className={cn("flex items-center gap-1", collapsed && "flex-col")}>
          <SidebarTeamSwitcher
            teams={teams}
            activeTeam={activeTeam}
            collapsed={collapsed}
            onTeamChange={onTeamChange}
            onCreateTeam={onCreateTeam}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
        </div>
      </div>

      <div className={cn("border-b p-2", collapsed && "flex justify-center")}>
        <Button
          type="button"
          className={cn(!collapsed && "w-full")}
          size={collapsed ? "icon-sm" : "sm"}
          onClick={onCreateSession}
          disabled={onboardingRequired}
          aria-label="New session"
        >
          <CalendarPlus />
          {!collapsed ? "New session" : null}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {!collapsed ? (
          <p className="px-2 pb-2 text-xs font-medium text-muted-foreground">Sessions</p>
        ) : null}
        {sessions === null ? (
          <div className="flex justify-center py-8">
            <Spinner className="size-4" />
          </div>
        ) : sessions.length === 0 ? (
          !collapsed ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">No sessions yet</p>
          ) : null
        ) : (
          <ul className="space-y-1">
            {sessions.map((session) => {
              const active = session.id === activeSessionId;
              return (
                <li key={session.id}>
                  <button
                    type="button"
                    className={cn(
                      "w-full rounded-md text-left transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      active && "bg-sidebar-accent text-sidebar-accent-foreground",
                      collapsed ? "flex justify-center px-2 py-2" : "px-3 py-2",
                    )}
                    onClick={() => onSelectSession(session.id)}
                    title={collapsed ? session.topic : undefined}
                  >
                    {collapsed ? (
                      <span className="flex size-8 items-center justify-center rounded-md bg-muted text-xs font-medium">
                        {session.topic.charAt(0).toUpperCase()}
                      </span>
                    ) : (
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{session.topic}</p>
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-auto border-t p-2">
        <div className={cn("flex items-center gap-1", collapsed && "flex-col")}>
          <div className={cn("min-w-0", !collapsed && "flex-1")}>
            <SidebarUserMenu user={user} collapsed={collapsed} onSignOut={onSignOut} />
          </div>
          {onOpenAccountSettings ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onOpenAccountSettings}
              aria-label="Account settings"
            >
              <Settings />
            </Button>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
