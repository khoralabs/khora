import {
  ArrowLeft,
  BarChart3,
  Boxes,
  Building2,
  CreditCard,
  type LucideIcon,
  ShieldCheck,
  UserRound,
  Users,
  UsersRound,
} from "lucide-react";
import { SidebarCollapsedTooltip } from "@/components/exedra/sidebar-collapsed-tooltip";
import { cn } from "@/lib/utils";
import {
  type AccountArea,
  type OrgArea,
  parseSettingsRoute,
  settingsAccountPath,
  settingsOrgPath,
} from "../shell/routes";

type SettingsSidebarProps = {
  pathname: string;
  collapsed: boolean;
  onNavigate: (path: string) => void;
};

type OrgNavItem = { area: OrgArea; label: string; icon: LucideIcon };
type AccountNavItem = { area: AccountArea; label: string; icon: LucideIcon };

const ORG_NAV_ITEMS: OrgNavItem[] = [
  { area: "general", label: "General", icon: Building2 },
  { area: "members", label: "Members", icon: Users },
  { area: "teams", label: "Teams", icon: UsersRound },
  { area: "access", label: "Access", icon: ShieldCheck },
  { area: "billing", label: "Billing", icon: CreditCard },
  { area: "usage", label: "Usage", icon: BarChart3 },
  { area: "models", label: "Models", icon: Boxes },
];

const ACCOUNT_NAV_ITEMS: AccountNavItem[] = [
  { area: "profile", label: "Profile", icon: UserRound },
];

function navButtonClassName(collapsed: boolean, active: boolean): string {
  return cn(
    "w-full rounded-md text-left transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
    active && "bg-sidebar-accent text-sidebar-accent-foreground",
    collapsed ? "flex justify-center px-2 py-2" : "flex items-center gap-2 px-3 py-2",
  );
}

export function SettingsSidebar({ pathname, collapsed, onNavigate }: SettingsSidebarProps) {
  const route = parseSettingsRoute(pathname);

  function renderItem(args: {
    key: string;
    label: string;
    icon: LucideIcon;
    active: boolean;
    path: string;
  }) {
    const { key, label, icon: Icon, active, path } = args;
    return (
      <li key={key}>
        <SidebarCollapsedTooltip collapsed={collapsed} label={label}>
          <button
            type="button"
            className={navButtonClassName(collapsed, active)}
            onClick={() => onNavigate(path)}
            aria-label={label}
          >
            <Icon className="size-4 shrink-0" />
            {!collapsed ? <span className="text-sm font-medium">{label}</span> : null}
          </button>
        </SidebarCollapsedTooltip>
      </li>
    );
  }

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
          <li className="px-3 pt-3 pb-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Organization
            </p>
          </li>
        ) : null}

        {ORG_NAV_ITEMS.map((item) =>
          renderItem({
            key: `org-${item.area}`,
            label: item.label,
            icon: item.icon,
            active: route.scope === "organization" && route.area === item.area,
            path: settingsOrgPath(item.area),
          }),
        )}

        {!collapsed ? (
          <li className="px-3 pt-3 pb-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Account
            </p>
          </li>
        ) : null}

        {ACCOUNT_NAV_ITEMS.map((item) =>
          renderItem({
            key: `account-${item.area}`,
            label: item.label,
            icon: item.icon,
            active: route.scope === "account" && route.area === item.area,
            path: settingsAccountPath(item.area),
          }),
        )}
      </ul>
    </div>
  );
}
