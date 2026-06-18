import type { AccountProfile } from "@shared/accounts/row";
import { Building2, Check, ChevronsUpDown, LogOut, UserRound } from "lucide-react";

import {
  AccountItem,
  AccountItemContent,
  AccountItemDescription,
  AccountItemMedia,
  AccountItemTitle,
} from "@/components/account/account-item";
import { EntityAvatar } from "@/components/entity-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { accountDescriptionSubtitle } from "@/lib/account-display";
import { ONBOARDING_PLACEHOLDER_ORG, type OrgSummary } from "@/lib/me-api";
import { cn } from "@/lib/utils";

import { SidebarCollapsedTooltip } from "./sidebar-collapsed-tooltip";

type SidebarUserMenuProps = {
  account: AccountProfile;
  org: OrgSummary;
  orgs: OrgSummary[];
  collapsed: boolean;
  onOrgChange?: (org: OrgSummary) => void;
  onOpenOrgSettings?: () => void;
  onOpenProfileSettings?: () => void;
  onSignOut?: () => void;
};

function SidebarAccountSummary({ account }: { account: AccountProfile }) {
  const subtitle = accountDescriptionSubtitle(account);
  return (
    <AccountItem
      account={account}
      isCurrentUser
      variant="default"
      size="sm"
      className="border-0 p-0"
    >
      <AccountItemMedia className="size-8 rounded-lg [&_[data-slot=avatar-fallback]]:rounded-lg" />
      <AccountItemContent>
        <AccountItemTitle />
        <AccountItemDescription>{subtitle}</AccountItemDescription>
      </AccountItemContent>
    </AccountItem>
  );
}

export function SidebarUserMenu({
  account,
  org,
  orgs,
  collapsed,
  onOrgChange,
  onOpenOrgSettings,
  onOpenProfileSettings,
  onSignOut,
}: SidebarUserMenuProps) {
  const displayOrg = orgs.length === 0 ? ONBOARDING_PLACEHOLDER_ORG : org;

  return (
    <DropdownMenu>
      <SidebarCollapsedTooltip collapsed={collapsed} label={displayOrg.name}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex w-full min-w-0 items-center gap-2 rounded-md p-2 text-left text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground",
              collapsed ? "justify-center px-2" : "px-2",
            )}
            aria-label={displayOrg.name}
          >
            <EntityAvatar
              name={displayOrg.name}
              avatarUrl={displayOrg.avatarUrl}
              className="size-8 shrink-0 rounded-lg [&_[data-slot=avatar-fallback]]:rounded-lg"
            />
            {!collapsed ? (
              <>
                <div className="grid min-w-0 flex-1 leading-tight">
                  <span
                    className={cn(
                      "truncate text-sm font-medium",
                      displayOrg.id.length === 0 && "text-muted-foreground",
                    )}
                  >
                    {displayOrg.name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">Organization</span>
                </div>
                <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50" />
              </>
            ) : null}
          </button>
        </DropdownMenuTrigger>
      </SidebarCollapsedTooltip>

      <DropdownMenuContent
        className="min-w-56 rounded-lg"
        side={collapsed ? "right" : "top"}
        align="end"
        sideOffset={4}
      >
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="px-1 py-1.5">
            <SidebarAccountSummary account={account} />
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {orgs.length > 1 && onOrgChange ? (
          <>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Organizations</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-48">
                {orgs.map((o) => (
                  <DropdownMenuItem key={o.id} onSelect={() => onOrgChange(o)}>
                    <EntityAvatar
                      name={o.name}
                      avatarUrl={o.avatarUrl}
                      className="size-5 rounded-md [&_[data-slot=avatar-fallback]]:rounded-md"
                    />
                    <span className="min-w-0 flex-1 truncate">{o.name}</span>
                    {o.id === org.id ? (
                      <Check className="ml-auto size-4 shrink-0 text-primary" />
                    ) : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
          </>
        ) : null}

        {onOpenOrgSettings ? (
          <DropdownMenuItem onSelect={onOpenOrgSettings}>
            <Building2 />
            Organization settings
          </DropdownMenuItem>
        ) : null}
        {onOpenProfileSettings ? (
          <DropdownMenuItem onSelect={onOpenProfileSettings}>
            <UserRound />
            Profile settings
          </DropdownMenuItem>
        ) : null}
        {(onOpenOrgSettings || onOpenProfileSettings) && onSignOut ? (
          <DropdownMenuSeparator />
        ) : null}
        {onSignOut ? (
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              onSignOut();
            }}
          >
            <LogOut />
            Log out
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
