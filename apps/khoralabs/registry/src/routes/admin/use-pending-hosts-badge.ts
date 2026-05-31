import { useUsersStats } from "@khoralabs/users-react";

export type PendingHostsBadge = {
  label: string;
  variant: "default" | "secondary" | "outline" | "destructive";
};

export function usePendingHostsBadge(): PendingHostsBadge | undefined {
  const { summary, summaryLoading } = useUsersStats();
  if (summaryLoading || summary === null) {
    return undefined;
  }
  const pending = summary.hosts.items.filter((host) => host.status === "pending").length;
  if (pending === 0) {
    return undefined;
  }
  return { label: `${pending} pending`, variant: "secondary" };
}
