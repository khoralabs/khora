import { ArrowLeft, Building2, UserRound, Users } from "lucide-react";
import { SidebarCollapsedTooltip } from "@/components/exedra/sidebar-collapsed-tooltip";
import type { MeTeam } from "@/lib/me-api";
import { cn } from "@/lib/utils";
import {
  parseSettingsSection,
  type SettingsSection,
  settingsPathForSection,
} from "../shell/routes";

type SettingsSidebarProps = {
  pathname: string;
  activeTeam: MeTeam;
  collapsed: boolean;
  onNavigate: (path: string) => void;
};

const NAV_ITEMS: { section: SettingsSection; label: string; icon: typeof Building2 }[] = [
  { section: "organization", label: "Organization", icon: Building2 },
  { section: "team", label: "Team", icon: Users },
  { section: "account", label: "Account", icon: UserRound },
];

export function SettingsSidebar({
  pathname,
  activeTeam,
  collapsed,
  onNavigate,
}: SettingsSidebarProps) {
  const activeSection = parseSettingsSection(pathname);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-2">
      {!collapsed ? (
        <p className="px-2 pb-2 text-xs font-medium text-muted-foreground">Settings</p>
      ) : null}
      <ul className="space-y-1">
        <li>
          <SidebarCollapsedTooltip collapsed={collapsed} label="Back to app">
            <button
              type="button"
              className={cn(
                "w-full rounded-md text-left transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                collapsed ? "flex justify-center px-2 py-2" : "flex items-center gap-2 px-3 py-2",
              )}
              onClick={() => onNavigate("/")}
              aria-label="Back to app"
            >
              <ArrowLeft className="size-4 shrink-0" />
              {!collapsed ? <span className="text-sm font-medium">Back to app</span> : null}
            </button>
          </SidebarCollapsedTooltip>
        </li>
        {NAV_ITEMS.map(({ section, label, icon: Icon }) => {
          const active = activeSection === section;
          const subtitle = section === "team" && !collapsed ? activeTeam.name : undefined;
          const tooltipLabel =
            section === "team" && collapsed ? `${label} · ${activeTeam.name}` : label;
          return (
            <li key={section}>
              <SidebarCollapsedTooltip collapsed={collapsed} label={tooltipLabel}>
                <button
                  type="button"
                  className={cn(
                    "w-full rounded-md text-left transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    active && "bg-sidebar-accent text-sidebar-accent-foreground",
                    collapsed
                      ? "flex justify-center px-2 py-2"
                      : "flex items-center gap-2 px-3 py-2",
                  )}
                  onClick={() => onNavigate(settingsPathForSection(section))}
                  aria-label={tooltipLabel}
                >
                  <Icon className="size-4 shrink-0" />
                  {!collapsed ? (
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{label}</p>
                      {subtitle ? (
                        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
                      ) : null}
                    </div>
                  ) : null}
                </button>
              </SidebarCollapsedTooltip>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
