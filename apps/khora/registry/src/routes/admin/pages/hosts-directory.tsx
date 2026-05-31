import { type RegistryHostSummaryItem, useUsersStats } from "@khoralabs/users-react/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HostDirectoryTable } from "../components/host-directory-table.tsx";
import { navigateAdmin } from "../use-pathname.ts";

export function HostsDirectoryPage() {
  const { summary, summaryLoading } = useUsersStats();
  const pendingCount = summary?.hosts.items.filter((host) => host.status === "pending").length ?? 0;
  const firstPending = summary?.hosts.items.find((host) => host.status === "pending") as
    | RegistryHostSummaryItem
    | undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hosts</h1>
        <p className="text-sm text-muted-foreground">
          Federated Khora hosts registered in the network
        </p>
      </div>

      {!summaryLoading && pendingCount > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pending activation</CardTitle>
            <CardDescription>
              {pendingCount} host{pendingCount === 1 ? "" : "s"} awaiting approval
            </CardDescription>
          </CardHeader>
          <CardContent>
            <button
              type="button"
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
              onClick={() =>
                navigateAdmin(
                  firstPending !== undefined ? `/admin/hosts/${firstPending.slug}` : "/admin/hosts",
                )
              }
            >
              Open first pending host
            </button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Host directory</CardTitle>
          <CardDescription>
            Select a host to manage activation, requirements, and origins
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HostDirectoryTable />
        </CardContent>
      </Card>
    </div>
  );
}
