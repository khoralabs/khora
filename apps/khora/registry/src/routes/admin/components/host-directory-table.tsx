import type { RegistryHostSummaryItem } from "@khoralabs/users";
import { useUsersStats } from "@khoralabs/users-react";
import { Badge } from "@/components/ui/badge";
import { navigateAdmin } from "../use-pathname.ts";

export function HostDirectoryTable() {
  const { summary, summaryLoading, summaryError } = useUsersStats();

  if (summaryLoading) {
    return <p className="text-sm text-muted-foreground">Loading hosts…</p>;
  }
  if (summaryError !== null) {
    return <p className="text-sm text-destructive">{summaryError}</p>;
  }

  const hosts = (summary?.hosts.items ?? []) as RegistryHostSummaryItem[];
  if (hosts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-slot="host-directory-empty">
        No hosts registered. Hosts self-register via POST /v1/hosts/register.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border" data-slot="host-directory-table">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30 text-left">
            <th className="px-3 py-2 font-medium">Slug</th>
            <th className="px-3 py-2 font-medium">Base URL</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Participation</th>
            <th className="px-3 py-2 font-medium">Origins</th>
          </tr>
        </thead>
        <tbody>
          {hosts.map((host) => (
            <tr
              key={host.id}
              className="cursor-pointer border-b last:border-b-0 hover:bg-muted/20"
              onClick={() => navigateAdmin(`/admin/hosts/${host.slug}`)}
            >
              <td className="px-3 py-2 font-mono">{host.slug}</td>
              <td className="max-w-xs truncate px-3 py-2 font-mono text-muted-foreground">
                {host.baseUrl}
              </td>
              <td className="px-3 py-2">
                <Badge variant={host.status === "active" ? "default" : "secondary"}>
                  {host.status}
                </Badge>
              </td>
              <td className="px-3 py-2">{host.registryParticipationEnabled ? "On" : "Off"}</td>
              <td className="px-3 py-2 font-mono text-muted-foreground">
                {host.trustedOrigins.length} / {host.trustedOriginQuota.included}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
