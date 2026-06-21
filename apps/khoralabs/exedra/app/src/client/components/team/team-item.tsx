import type { TeamProfile } from "@shared/teams/row";
import { type ComponentProps, createContext, type ReactNode, useContext } from "react";

import { EntityAvatar } from "@/components/entity-avatar";
import { Badge } from "@/components/ui/badge";
import { Item, ItemActions, ItemContent, ItemMedia } from "@/components/ui/item";
import { cn } from "@/lib/utils";

type TeamItemContextValue = {
  team: TeamProfile;
  isCurrentTeam: boolean;
};

const TeamItemContext = createContext<TeamItemContextValue | null>(null);

function useTeamItemContext(): TeamItemContextValue {
  const value = useContext(TeamItemContext);
  if (value === null) {
    throw new Error("TeamItem subcomponents must be used within TeamItem");
  }
  return value;
}

type TeamItemProps = ComponentProps<typeof Item> & {
  team: TeamProfile;
  isCurrentTeam?: boolean;
  children: ReactNode;
};

export function TeamItem({
  team,
  isCurrentTeam = false,
  children,
  className,
  ...props
}: TeamItemProps) {
  return (
    <TeamItemContext.Provider value={{ team, isCurrentTeam }}>
      <Item className={cn("min-w-0 flex-nowrap items-center", className)} {...props}>
        {children}
      </Item>
    </TeamItemContext.Provider>
  );
}

type TeamItemMediaProps = {
  size?: "default" | "sm" | "lg";
  className?: string;
};

export function TeamItemMedia({ size = "sm", className }: TeamItemMediaProps) {
  const { team } = useTeamItemContext();
  return (
    <ItemMedia variant="image" className={className}>
      <EntityAvatar name={team.name} avatarUrl={team.avatarUrl} size={size} />
    </ItemMedia>
  );
}

export function TeamItemContent({ className, ...props }: ComponentProps<typeof ItemContent>) {
  return <ItemContent className={cn("min-w-0 flex-1 overflow-hidden", className)} {...props} />;
}

type TeamItemTitleProps = ComponentProps<"div"> & {
  children?: ReactNode;
};

export function TeamItemTitle({ children, className, ...props }: TeamItemTitleProps) {
  const { team, isCurrentTeam } = useTeamItemContext();
  const label = children ?? team.name;
  return (
    <div
      className={cn("flex min-w-0 items-center gap-2 text-sm font-medium leading-snug", className)}
      {...props}
    >
      <span className="truncate">{label}</span>
      {isCurrentTeam ? (
        <Badge variant="secondary" className="shrink-0 font-normal">
          Current
        </Badge>
      ) : null}
    </div>
  );
}

export function TeamItemDescription({ className, ...props }: ComponentProps<"p">) {
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

type TeamItemBadgesProps = {
  badges: readonly string[];
  className?: string;
};

export function TeamItemBadges({ badges, className }: TeamItemBadgesProps) {
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

export function TeamItemActions({ className, ...props }: ComponentProps<typeof ItemActions>) {
  return <ItemActions className={cn("shrink-0", className)} {...props} />;
}
