import type { KhoraHost } from "@khoralabs/users";
import type * as React from "react";
import { cn } from "../cn.ts";
import { useUsersStats } from "../context";

function LoadingOrError({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading) return <p data-slot="users-stats-loading">Loading…</p>;
  if (error !== null) return <p data-slot="users-stats-error">{error}</p>;
  return null;
}

export function UsersStatsHostList({ className, ...props }: React.ComponentProps<"ul">) {
  const { summary, summaryLoading, summaryError } = useUsersStats();

  return (
    <ul data-slot="users-stats-host-list" className={cn(className)} {...props}>
      <LoadingOrError loading={summaryLoading} error={summaryError} />
      {!summaryLoading &&
        summaryError === null &&
        summary?.hosts.items.map((host) => <UsersStatsHostListItem key={host.id} host={host} />)}
    </ul>
  );
}

export type UsersStatsHostListItemProps = React.ComponentProps<"li"> & {
  host: KhoraHost;
};

export function UsersStatsHostListItem({ host, className, ...props }: UsersStatsHostListItemProps) {
  return (
    <li
      data-slot="users-stats-host-list-item"
      className={cn("font-mono text-sm", className)}
      {...props}
    >
      <span data-slot="users-stats-host-slug">{host.slug}</span>
      <span data-slot="users-stats-host-url" className="text-muted-foreground">
        {" "}
        — {host.baseUrl} ({host.status})
      </span>
    </li>
  );
}
