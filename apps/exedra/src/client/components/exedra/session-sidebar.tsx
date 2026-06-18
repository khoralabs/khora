import { KnowledgeScopePicker } from "@/components/exedra/knowledge-scope-picker";
import { NewSessionButton } from "@/components/exedra/new-session-button";
import { SidebarTeamSwitcher } from "@/components/exedra/sidebar-team-switcher";
import { SidebarUserMenu } from "@/components/exedra/sidebar-user-menu";
import { Spinner } from "@/components/ui/spinner";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { MeResponse, MeTeam, OrgSummary } from "@/lib/me-api";
import type { SessionSummary } from "@/lib/sessions-api";
import { cn } from "@/lib/utils";
import { SettingsSidebar } from "@/settings/settings-sidebar";
import { appSectionHeaderClassName } from "@/shell/app-section-header";

import { SidebarCollapsedTooltip } from "./sidebar-collapsed-tooltip";

type SessionSidebarProps = {
  me: MeResponse;
  teams: MeTeam[];
  activeTeam: MeTeam;
  activeOrg: OrgSummary;
  orgs: OrgSummary[];
  sessions: SessionSummary[] | null;
  activeSessionId: string | null;
  pathname: string;
  collapsed: boolean;
  createSessionDisabled?: boolean;
  onTeamChange: (team: MeTeam) => void;
  onOrgChange?: (org: OrgSummary) => void;
  onCreateSession: () => void;
  onCreateTeam?: () => void;
  onManageTeams?: () => void;
  onSelectSession: (sessionId: string) => void;
  onOpenOrgSettings?: () => void;
  onOpenProfileSettings?: () => void;
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
  activeOrg,
  orgs,
  sessions,
  activeSessionId,
  pathname,
  collapsed: collapsedProp,
  createSessionDisabled = false,
  onTeamChange,
  onOrgChange,
  onCreateSession,
  onCreateTeam,
  onManageTeams,
  onSelectSession,
  onOpenOrgSettings,
  onOpenProfileSettings,
  onSignOut,
  settingsMode = false,
  onNavigate,
  className,
  sheetMode = false,
  onDismiss,
}: SessionSidebarProps) {
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
      <TooltipProvider delayDuration={0}>
        <div
          className={appSectionHeaderClassName(
            collapsed ? "justify-center px-2" : "px-3",
            sheetMode && "pr-12",
          )}
        >
          <div className={cn("min-w-0", collapsed ? "flex justify-center" : "w-full")}>
            <SidebarTeamSwitcher
              teams={teams}
              activeTeam={activeTeam}
              collapsed={collapsed}
              onTeamChange={(team) => {
                onTeamChange(team);
                onDismiss?.();
              }}
              onCreateTeam={onCreateTeam}
              onManageTeams={onManageTeams}
            />
          </div>
        </div>

        {!settingsMode ? (
          <div className={cn("border-b p-2", collapsed && "flex justify-center")}>
            <NewSessionButton
              collapsed={collapsed}
              disabled={createSessionDisabled}
              onboardingInterviewRequired={me.onboardingInterviewRequired}
              onboardingSessionId={me.onboardingSessionId}
              onClick={dismissAfter(onCreateSession)}
            />
          </div>
        ) : null}

        {settingsMode && onNavigate !== undefined ? (
          <SettingsSidebar
            pathname={pathname}
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
                        <SidebarCollapsedTooltip collapsed={collapsed} label={session.topic}>
                          <button
                            type="button"
                            className={cn(
                              "w-full rounded-md text-left transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                              active && "bg-sidebar-accent text-sidebar-accent-foreground",
                              collapsed ? "flex justify-center px-2 py-2" : "px-3 py-2",
                            )}
                            onClick={dismissAfter(() => onSelectSession(session.id))}
                            aria-label={session.topic}
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
                        </SidebarCollapsedTooltip>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className={cn("border-b p-2", collapsed && "flex flex-col items-center gap-1")}>
              {!collapsed ? (
                <p className="px-2 pb-2 text-xs font-medium text-muted-foreground">Knowledge</p>
              ) : null}
              {onNavigate !== undefined ? (
                <KnowledgeScopePicker
                  me={me}
                  activeTeam={activeTeam}
                  sessions={sessions}
                  pathname={pathname}
                  onNavigate={(path) => {
                    onNavigate(path);
                    onDismiss?.();
                  }}
                  variant="sidebar"
                  collapsed={collapsed}
                />
              ) : null}
            </div>
          </>
        )}

        <div className="mt-auto border-t p-2">
          <SidebarUserMenu
            account={me.user}
            org={activeOrg}
            orgs={orgs}
            collapsed={collapsed}
            onOrgChange={(org) => {
              onOrgChange?.(org);
              onDismiss?.();
            }}
            onOpenOrgSettings={
              onOpenOrgSettings
                ? () => {
                    onOpenOrgSettings();
                    onDismiss?.();
                  }
                : undefined
            }
            onOpenProfileSettings={
              onOpenProfileSettings
                ? () => {
                    onOpenProfileSettings();
                    onDismiss?.();
                  }
                : undefined
            }
            onSignOut={onSignOut}
          />
        </div>
      </TooltipProvider>
    </Root>
  );
}
