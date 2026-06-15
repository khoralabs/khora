import { ChevronsUpDown, LogOut } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type SidebarUser = {
  name: string;
  subtitle: string;
  email: string;
  initials: string;
};

export function formatSidebarUser(user: {
  registryUserId: string;
  fullName?: string | null;
  jobFunction?: string | null;
}): SidebarUser {
  const email = user.registryUserId;
  const trimmedFullName = user.fullName?.trim() ?? "";
  const trimmedJobFunction = user.jobFunction?.trim() ?? "";
  const subtitle = trimmedJobFunction.length > 0 ? trimmedJobFunction : email;

  if (trimmedFullName.length > 0) {
    const parts = trimmedFullName.split(/\s+/).filter(Boolean);
    const initials =
      parts.length >= 2
        ? `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase()
        : trimmedFullName.slice(0, 2).toUpperCase();
    return {
      name: trimmedFullName,
      subtitle,
      email,
      initials: initials.length > 0 ? initials : trimmedFullName.slice(0, 2).toUpperCase(),
    };
  }

  const atIndex = email.indexOf("@");
  if (atIndex !== -1) {
    const localPart = email.slice(0, atIndex);
    const name = localPart.length > 0 ? localPart : email;
    return {
      name,
      subtitle,
      email,
      initials: name.slice(0, 2).toUpperCase(),
    };
  }

  const shortId = email.slice(0, 8);
  return {
    name: shortId,
    subtitle,
    email,
    initials: shortId.slice(0, 2).toUpperCase(),
  };
}

type SidebarUserMenuProps = {
  user: SidebarUser;
  collapsed: boolean;
  onSignOut?: () => void;
};

export function SidebarUserMenu({ user, collapsed, onSignOut }: SidebarUserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2 rounded-md p-2 text-left text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground",
            collapsed ? "justify-center px-2" : "px-2",
          )}
          title={collapsed ? `${user.name} · ${user.subtitle}` : undefined}
        >
          <Avatar className="size-8 rounded-lg">
            <AvatarFallback className="rounded-lg text-xs">{user.initials}</AvatarFallback>
          </Avatar>
          {!collapsed ? (
            <>
              <div className="grid min-w-0 flex-1 text-left leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">{user.subtitle}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50" />
            </>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="min-w-56 rounded-lg"
        side={collapsed ? "right" : "top"}
        align="end"
        sideOffset={4}
      >
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
            <Avatar className="size-8 rounded-lg">
              <AvatarFallback className="rounded-lg text-xs">{user.initials}</AvatarFallback>
            </Avatar>
            <div className="grid min-w-0 flex-1 leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">{user.subtitle}</span>
            </div>
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
