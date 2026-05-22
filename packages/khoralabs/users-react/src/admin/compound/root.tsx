import type * as React from "react";
import { cn } from "../cn.ts";
import { UsersStatsProvider, type UsersStatsProviderProps } from "../context.tsx";

export type UsersStatsRootProps = React.ComponentProps<"div"> &
  Omit<UsersStatsProviderProps, "children">;

export function UsersStatsRoot({
  baseUrl,
  lookupBaseUrl,
  fetchImpl,
  className,
  children,
  ...props
}: UsersStatsRootProps) {
  return (
    <UsersStatsProvider baseUrl={baseUrl} lookupBaseUrl={lookupBaseUrl} fetchImpl={fetchImpl}>
      <div data-slot="users-stats-root" className={cn(className)} {...props}>
        {children}
      </div>
    </UsersStatsProvider>
  );
}
