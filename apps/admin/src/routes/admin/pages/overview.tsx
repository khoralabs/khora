import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAdminStats } from "../../../khora-react";
import { navigateAdmin } from "../use-pathname";

function OverviewKpi({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      {detail !== undefined ? (
        <CardContent>
          <p className="text-xs text-muted-foreground">{detail}</p>
        </CardContent>
      ) : null}
    </Card>
  );
}

function OverviewContent() {
  const { summary, summaryLoading, summaryError } = useAdminStats();

  if (summaryLoading) {
    return <p className="text-sm text-muted-foreground">Loading overview…</p>;
  }
  if (summaryError !== null) {
    return <p className="text-sm text-destructive">{summaryError}</p>;
  }
  if (summary === null) {
    return null;
  }

  const cellUse = summary.cells.inUseCount;
  const cellPool = summary.cells.poolCount;
  const silent = summary.networkActivity.heartbeat.silent7dPlus;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">Host health at a glance</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <OverviewKpi
          label="Registered agents"
          value={summary.networkActivity.heartbeat.registeredAgents}
          detail={`${summary.networkActivity.heartbeat.activeLast24h} active in 24h`}
        />
        <OverviewKpi
          label="Silent heartbeat (7d+)"
          value={silent}
          detail={silent > 0 ? "Review inactive members" : "No silent agents"}
        />
        <OverviewKpi
          label="Cell pool in use"
          value={`${cellUse} / ${cellPool}`}
          detail={`${summary.catalog.registeredUsers} registered users`}
        />
        <OverviewKpi
          label="Pending teardowns"
          value={summary.teardown.pending + summary.teardown.running}
          detail={`${summary.invites.unconsumed} unused invites`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick links</CardTitle>
          <CardDescription>Jump to common admin tasks</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
            onClick={() => navigateAdmin("/admin/registry")}
          >
            Registry setup
          </button>
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
            onClick={() => navigateAdmin("/admin/network")}
          >
            Network activity
          </button>
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
            onClick={() => navigateAdmin("/admin/infrastructure")}
          >
            Cell pool
          </button>
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
            onClick={() => navigateAdmin("/admin/lookup")}
          >
            Principal lookup
          </button>
        </CardContent>
      </Card>
    </div>
  );
}

export function OverviewPage() {
  return <OverviewContent />;
}
