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
  const pendingHosts = summary.hosts.items.filter((host) => host.status === "pending").length;
  const pendingOrigins = summary.hosts.pendingOriginRequests;
  if (pendingHosts === 0 && pendingOrigins === 0) {
    return undefined;
  }
  const parts: string[] = [];
  if (pendingHosts > 0) {
    parts.push(`${pendingHosts} host${pendingHosts === 1 ? "" : "s"}`);
  }
  if (pendingOrigins > 0) {
    parts.push(`${pendingOrigins} origin${pendingOrigins === 1 ? "" : "s"}`);
  }
  return { label: `${parts.join(", ")} pending`, variant: "secondary" };
}
