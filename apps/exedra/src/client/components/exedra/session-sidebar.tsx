import {
  CalendarPlus,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  UserRound,
} from "lucide-react";
import { SidebarTeamSwitcher } from "@/components/exedra/sidebar-team-switcher";
import { formatSidebarUser, SidebarUserMenu } from "@/components/exedra/sidebar-user-menu";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { MeResponse, MeTeam } from "@/lib/me-api";
import type { SessionSummary } from "@/lib/sessions-api";
import { cn } from "@/lib/utils";
import { SettingsSidebar } from "@/settings/settings-sidebar";

type SessionSidebarProps = {
  me: MeResponse;
  teams: MeTeam[];
  activeTeam: MeTeam;
  sessions: SessionSummary[] | null;
  activeSessionId: string | null;
  pathname: string;
  collapsed: boolean;
  createSessionDisabled?: boolean;
  onToggleCollapsed: () => void;
  onTeamChange: (team: MeTeam) => void;
  onCreateSession: () => void;
  onCreateTeam?: () => void;
  onSelectSession: (sessionId: string) => void;
  onOpenTeamGraph: () => void;
  onOpenPersonalGraph: () => void;
  onOpenSettings?: () => void;
  onSignOut?: () => void;
  settingsMode?: boolean;
  onNavigate?: (path: string) => void;
  className?: string;
  sheetMode?: boolean;
  onDismiss?: () => void;
};

export function SessionSidebar({
  me,
  teams,
  activeTeam,
  sessions,
  activeSessionId,
  pathname,
  collapsed: collapsedProp,
  createSessionDisabled = false,
  onToggleCollapsed,
  onTeamChange,
  onCreateSession,
  onCreateTeam,
  onSelectSession,
  onOpenTeamGraph,
  onOpenPersonalGraph,
  onOpenSettings,
  onSignOut,
  settingsMode = false,
  onNavigate,
  className,
  sheetMode = false,
  onDismiss,
}: SessionSidebarProps) {
  const user = formatSidebarUser(me.user);
  const teamGraphActive = /^\/teams\/([^/]+)\/graph\/?$/.test(pathname);
  const personalGraphActive = /^\/me\/graph\/?$/.test(pathname);
  const collapsed = sheetMode ? false : collapsedProp;

  function dismissAfter(action: () => void) {
    return () => {
      action();
      onDismiss?.();
    };
  }

  const Root = sheetMode ? "div" : "aside";

  return (
    <Root
      className={cn(
        "flex shrink-0 flex-col bg-sidebar text-sidebar-foreground",
        !sheetMode && "border-r transition-[width] duration-200",
        !sheetMode && (collapsed ? "w-14" : "w-64"),
        sheetMode && "h-full min-h-0",
        className,
      )}
    >
      <div className={cn("border-b p-2", collapsed ? "px-2" : "px-3")}>
        <div className={cn("flex items-center gap-1", collapsed && "flex-col")}>
          <SidebarTeamSwitcher
            teams={teams}
            activeTeam={activeTeam}
            collapsed={collapsed}
            onTeamChange={(team) => {
              onTeamChange(team);
              onDismiss?.();
            }}
            onCreateTeam={onCreateTeam}
          />
          {!sheetMode ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onToggleCollapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </Button>
          ) : null}
        </div>
      </div>

      <div className={cn("border-b p-2", collapsed && "flex justify-center")}>
        {!settingsMode ? (
          <Button
            type="button"
            className={cn(!collapsed && "w-full")}
            size={collapsed ? "icon-sm" : "sm"}
            onClick={dismissAfter(onCreateSession)}
            disabled={createSessionDisabled}
            aria-label="New session"
          >
            <CalendarPlus />
            {!collapsed ? "New session" : null}
          </Button>
        ) : null}
      </div>

      {settingsMode && onNavigate !== undefined ? (
        <SettingsSidebar
          pathname={pathname}
          activeTeam={activeTeam}
          collapsed={collapsed}
          onNavigate={(path) => {
            onNavigate(path);
            onDismiss?.();
          }}
        />
      ) : (
        <>
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
                <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                  No sessions yet
                </p>
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
                        onClick={dismissAfter(() => onSelectSession(session.id))}
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

          <div className={cn("border-b p-2", collapsed && "flex flex-col items-center gap-1")}>
            {!collapsed ? (
              <p className="px-2 pb-2 text-xs font-medium text-muted-foreground">Memories</p>
            ) : null}
            <ul className="space-y-1">
              <li>
                <button
                  type="button"
                  className={cn(
                    "w-full rounded-md text-left transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    teamGraphActive && "bg-sidebar-accent text-sidebar-accent-foreground",
                    collapsed
                      ? "flex justify-center px-2 py-2"
                      : "flex items-center gap-2 px-3 py-2",
                  )}
                  onClick={dismissAfter(onOpenTeamGraph)}
                  title={collapsed ? "Team memories" : undefined}
                >
                  <Network className="size-4 shrink-0" />
                  {!collapsed ? <span className="text-sm font-medium">Team memories</span> : null}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className={cn(
                    "w-full rounded-md text-left transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    personalGraphActive && "bg-sidebar-accent text-sidebar-accent-foreground",
                    collapsed
                      ? "flex justify-center px-2 py-2"
                      : "flex items-center gap-2 px-3 py-2",
                  )}
                  onClick={dismissAfter(onOpenPersonalGraph)}
                  title={collapsed ? "Personal memories" : undefined}
                >
                  <UserRound className="size-4 shrink-0" />
                  {!collapsed ? (
                    <span className="text-sm font-medium">Personal memories</span>
                  ) : null}
                </button>
              </li>
            </ul>
          </div>
        </>
      )}

      <div className="mt-auto border-t p-2">
        <div className={cn("flex items-center gap-1", collapsed && "flex-col")}>
          <div className={cn("min-w-0", !collapsed && "flex-1")}>
            <SidebarUserMenu user={user} collapsed={collapsed} onSignOut={onSignOut} />
          </div>
          {onOpenSettings ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onOpenSettings ? dismissAfter(onOpenSettings) : undefined}
              aria-label="Settings"
              aria-current={settingsMode ? "page" : undefined}
              className={
                settingsMode ? "bg-sidebar-accent text-sidebar-accent-foreground" : undefined
              }
            >
              <Settings />
            </Button>
          ) : null}
        </div>
      </div>
    </Root>
  );
}
