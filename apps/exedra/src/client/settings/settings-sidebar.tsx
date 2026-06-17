import { ArrowLeft, Building2, UserRound, Users } from "lucide-react";
import { SidebarCollapsedTooltip } from "@/components/exedra/sidebar-collapsed-tooltip";
import type { MeTeam } from "@/lib/me-api";
import { cn } from "@/lib/utils";
import {
  isOrganizationSettingsSection,
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

const ORG_NAV_ITEMS: { section: SettingsSection; label: string }[] = [
  { section: "organization", label: "General" },
  { section: "organization-members", label: "Members" },
  { section: "organization-teams", label: "Teams" },
];

const OTHER_NAV_ITEMS: {
  section: SettingsSection;
  label: string;
  icon: typeof Building2;
}[] = [
  { section: "team", label: "Team", icon: Users },
  { section: "account", label: "Account", icon: UserRound },
];

function navButtonClassName(collapsed: boolean, active: boolean): string {
  return cn(
    "w-full rounded-md text-left transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
    active && "bg-sidebar-accent text-sidebar-accent-foreground",
    collapsed ? "flex justify-center px-2 py-2" : "flex items-center gap-2 px-3 py-2",
  );
}

export function SettingsSidebar({
  pathname,
  activeTeam,
  collapsed,
  onNavigate,
}: SettingsSidebarProps) {
  const activeSection = parseSettingsSection(pathname);
  const orgSectionActive = isOrganizationSettingsSection(activeSection);

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
              className={navButtonClassName(collapsed, false)}
              onClick={() => onNavigate("/")}
              aria-label="Back to app"
            >
              <ArrowLeft className="size-4 shrink-0" />
              {!collapsed ? <span className="text-sm font-medium">Back to app</span> : null}
            </button>
          </SidebarCollapsedTooltip>
        </li>

        {!collapsed ? (
          <li className="px-3 pt-2 pb-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Organization
            </p>
          </li>
        ) : (
          <li>
            <SidebarCollapsedTooltip collapsed={collapsed} label="Organization">
              <button
                type="button"
                className={navButtonClassName(collapsed, orgSectionActive)}
                onClick={() => onNavigate(settingsPathForSection("organization"))}
                aria-label="Organization"
              >
                <Building2 className="size-4 shrink-0" />
              </button>
            </SidebarCollapsedTooltip>
          </li>
        )}

        {ORG_NAV_ITEMS.map(({ section, label }) => {
          const active = activeSection === section;
          if (collapsed) {
            if (section !== "organization") return null;
            return null;
          }
          return (
            <li key={section}>
              <button
                type="button"
                className={cn(navButtonClassName(false, active), "pl-6")}
                onClick={() => onNavigate(settingsPathForSection(section))}
              >
                <span className="text-sm font-medium">{label}</span>
              </button>
            </li>
          );
        })}

        {OTHER_NAV_ITEMS.map(({ section, label, icon: Icon }) => {
          const active = activeSection === section;
          const subtitle = section === "team" && !collapsed ? activeTeam.name : undefined;
          const tooltipLabel =
            section === "team" && collapsed ? `${label} · ${activeTeam.name}` : label;
          return (
            <li key={section}>
              <SidebarCollapsedTooltip collapsed={collapsed} label={tooltipLabel}>
                <button
                  type="button"
                  className={navButtonClassName(collapsed, active)}
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
