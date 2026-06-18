import type { AccountProfile } from "@shared/accounts/row";
import { type ComponentProps, createContext, type ReactNode, useContext } from "react";

import { EntityAvatar } from "@/components/entity-avatar";
import { Badge } from "@/components/ui/badge";
import { Item, ItemActions, ItemContent, ItemMedia } from "@/components/ui/item";
import { formatAccountDisplayName } from "@/lib/account-display";
import { cn } from "@/lib/utils";

type AccountItemContextValue = {
  account: AccountProfile;
  isCurrentUser: boolean;
};

const AccountItemContext = createContext<AccountItemContextValue | null>(null);

function useAccountItemContext(): AccountItemContextValue {
  const value = useContext(AccountItemContext);
  if (value === null) {
    throw new Error("AccountItem subcomponents must be used within AccountItem");
  }
  return value;
}

type AccountItemProps = ComponentProps<typeof Item> & {
  account: AccountProfile;
  isCurrentUser?: boolean;
  children: ReactNode;
};

export function AccountItem({
  account,
  isCurrentUser = false,
  children,
  className,
  ...props
}: AccountItemProps) {
  return (
    <AccountItemContext.Provider value={{ account, isCurrentUser }}>
      <Item className={cn("min-w-0 flex-nowrap items-center", className)} {...props}>
        {children}
      </Item>
    </AccountItemContext.Provider>
  );
}

type AccountItemMediaProps = {
  size?: "default" | "sm" | "lg";
  className?: string;
};

export function AccountItemMedia({ size = "sm", className }: AccountItemMediaProps) {
  const { account } = useAccountItemContext();
  const name = formatAccountDisplayName(account);
  return (
    <ItemMedia variant="image" className={className}>
      <EntityAvatar name={name} avatarUrl={account.avatarUrl} size={size} />
    </ItemMedia>
  );
}

export function AccountItemContent({ className, ...props }: ComponentProps<typeof ItemContent>) {
  return <ItemContent className={cn("min-w-0 flex-1 overflow-hidden", className)} {...props} />;
}

type AccountItemTitleProps = ComponentProps<"div"> & {
  children?: ReactNode;
};

export function AccountItemTitle({ children, className, ...props }: AccountItemTitleProps) {
  const { account, isCurrentUser } = useAccountItemContext();
  const label = children ?? formatAccountDisplayName(account);
  return (
    <div
      className={cn("flex min-w-0 items-center gap-2 text-sm font-medium leading-snug", className)}
      {...props}
    >
      <span className="truncate">{label}</span>
      {isCurrentUser ? (
        <Badge variant="secondary" className="shrink-0 font-normal">
          You
        </Badge>
      ) : null}
    </div>
  );
}

export function AccountItemDescription({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="item-description"
      className={cn(
        "truncate text-sm font-normal leading-normal text-muted-foreground",
        "[&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary",
        className,
      )}
      {...props}
    />
  );
}

type AccountItemBadgesProps = {
  badges: readonly string[];
  className?: string;
};

export function AccountItemBadges({ badges, className }: AccountItemBadgesProps) {
  if (badges.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {badges.map((badge) => (
        <Badge key={badge} variant="outline" className="font-normal">
          {badge}
        </Badge>
      ))}
    </div>
  );
}

export function AccountItemActions({ className, ...props }: ComponentProps<typeof ItemActions>) {
  return <ItemActions className={cn("shrink-0", className)} {...props} />;
}
