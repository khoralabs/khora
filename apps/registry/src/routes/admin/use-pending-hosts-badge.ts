import { useUsersStats } from "@/routes/admin/ui";

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
  const pendingQuotas = summary.hosts.pendingQuotaRequests;
  if (pendingHosts === 0 && pendingOrigins === 0 && pendingQuotas === 0) {
    return undefined;
  }
  const parts: string[] = [];
  if (pendingHosts > 0) {
    parts.push(`${pendingHosts} host${pendingHosts === 1 ? "" : "s"}`);
  }
  if (pendingOrigins > 0) {
    parts.push(`${pendingOrigins} origin${pendingOrigins === 1 ? "" : "s"}`);
  }
  if (pendingQuotas > 0) {
    parts.push(`${pendingQuotas} quota${pendingQuotas === 1 ? "" : "s"}`);
  }
  return { label: `${parts.join(", ")} pending`, variant: "secondary" };
}
