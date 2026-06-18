import type { AccountProfile } from "@shared/accounts/row";
import { ChevronsUpDown, LogOut } from "lucide-react";

import {
  AccountItem,
  AccountItemActions,
  AccountItemContent,
  AccountItemDescription,
  AccountItemMedia,
  AccountItemTitle,
} from "@/components/account/account-item";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { accountDescriptionSubtitle } from "@/lib/account-display";
import { cn } from "@/lib/utils";

import { SidebarCollapsedTooltip } from "./sidebar-collapsed-tooltip";

type SidebarUserMenuProps = {
  account: AccountProfile;
  collapsed: boolean;
  onSignOut?: () => void;
};

function SidebarAccountSummary({
  account,
  showChevron,
  className,
}: {
  account: AccountProfile;
  showChevron?: boolean;
  className?: string;
}) {
  const subtitle = accountDescriptionSubtitle(account);
  return (
    <AccountItem
      account={account}
      isCurrentUser
      variant="default"
      size="sm"
      className={cn("border-0 p-0", className)}
    >
      <AccountItemMedia className="size-8 rounded-lg [&_[data-slot=avatar-fallback]]:rounded-lg" />
      <AccountItemContent>
        <AccountItemTitle />
        <AccountItemDescription>{subtitle}</AccountItemDescription>
      </AccountItemContent>
      {showChevron ? (
        <AccountItemActions>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </AccountItemActions>
      ) : null}
    </AccountItem>
  );
}

export function SidebarUserMenu({ account, collapsed, onSignOut }: SidebarUserMenuProps) {
  const subtitle = accountDescriptionSubtitle(account);
  const accountLabel = `${account.fullName?.trim() || account.registryUserId} · ${subtitle}`;

  return (
    <DropdownMenu>
      <SidebarCollapsedTooltip collapsed={collapsed} label="Your account">
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex w-full min-w-0 items-center gap-2 rounded-md p-2 text-left text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground",
              collapsed ? "justify-center px-2" : "px-2",
            )}
            aria-label={accountLabel}
          >
            {collapsed ? (
              <AccountItem
                account={account}
                isCurrentUser
                variant="default"
                size="sm"
                className="border-0 p-0"
              >
                <AccountItemMedia className="size-8 rounded-lg [&_[data-slot=avatar-fallback]]:rounded-lg" />
              </AccountItem>
            ) : (
              <SidebarAccountSummary account={account} showChevron className="w-full" />
            )}
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
