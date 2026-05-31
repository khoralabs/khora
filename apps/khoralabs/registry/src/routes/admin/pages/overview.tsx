import { UsersStats, useUsersStats } from "@khoralabs/users-react";
import { useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { navigateAdmin } from "../use-pathname.ts";

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
  const { summary, summaryLoading, summaryError, refetchSummary } = useUsersStats();

  useEffect(() => {
    void refetchSummary();
  }, [refetchSummary]);

  if (summaryLoading) {
    return <p className="text-sm text-muted-foreground">Loading overview…</p>;
  }
  if (summaryError !== null) {
    return <p className="text-sm text-destructive">{summaryError}</p>;
  }
  if (summary === null) {
    return null;
  }

  const pendingCount = summary.hosts.items.filter((host) => host.status === "pending").length;
  const firstPending = summary.hosts.items.find((host) => host.status === "pending");
  const pendingOriginCount = summary.hosts.pendingOriginRequests;
  const firstOriginHost = summary.hosts.items.find((host) => host.pendingOriginRequestCount > 0);
  const pendingQuotaCount = summary.hosts.pendingQuotaRequests;
  const firstQuotaHost = summary.hosts.items.find((host) => host.pendingQuotaRequestCount > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Network accounts, hosts, and access activity
        </p>
      </div>

      {pendingCount > 0 ? (
        <Card className="border-secondary">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pending host activations</CardTitle>
            <CardDescription>
              {pendingCount} host{pendingCount === 1 ? "" : "s"} awaiting operator approval
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
              Review pending hosts
            </button>
          </CardContent>
        </Card>
      ) : null}

      {pendingOriginCount > 0 ? (
        <Card className="border-secondary">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pending trusted origin requests</CardTitle>
            <CardDescription>
              {pendingOriginCount} origin request{pendingOriginCount === 1 ? "" : "s"} awaiting
              operator approval
            </CardDescription>
          </CardHeader>
          <CardContent>
            <button
              type="button"
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
              onClick={() =>
                navigateAdmin(
                  firstOriginHost !== undefined
                    ? `/admin/hosts/${firstOriginHost.slug}`
                    : "/admin/hosts",
                )
              }
            >
              Review origin requests
            </button>
          </CardContent>
        </Card>
      ) : null}

      {pendingQuotaCount > 0 ? (
        <Card className="border-secondary">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pending trusted origin quota requests</CardTitle>
            <CardDescription>
              {pendingQuotaCount} quota request{pendingQuotaCount === 1 ? "" : "s"} awaiting
              operator approval
            </CardDescription>
          </CardHeader>
          <CardContent>
            <button
              type="button"
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
              onClick={() =>
                navigateAdmin(
                  firstQuotaHost !== undefined
                    ? `/admin/hosts/${firstQuotaHost.slug}`
                    : "/admin/hosts",
                )
              }
            >
              Review quota requests
            </button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <OverviewKpi
          label="Accounts"
          value={summary.accounts.total}
          detail={`${summary.accounts.active} active`}
        />
        <OverviewKpi
          label="Registered hosts"
          value={summary.hosts.total}
          detail={`${summary.hosts.active} active`}
        />
        <OverviewKpi
          label="Access requests"
          value={summary.accessTokenRequests.total}
          detail={`${summary.accessTokenRequests.byStatus.pending} pending`}
        />
        <OverviewKpi
          label="Marketing consents"
          value={summary.marketingConsents.active}
          detail={`${summary.marketingConsents.total} total`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Network metrics</CardTitle>
          <CardDescription>Accounts, access requests, and marketing consents</CardDescription>
        </CardHeader>
        <CardContent>
          <UsersStats.Overview className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <h3 className="text-sm font-medium">Accounts</h3>
                <UsersStats.AccountsMetrics className="grid gap-2 text-sm [&_dt]:text-muted-foreground [&_dd]:font-mono" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-medium">Access requests</h3>
                <UsersStats.AccessRequestsMetrics className="grid gap-2 text-sm [&_dt]:text-muted-foreground [&_dd]:font-mono" />
              </div>
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-medium">Marketing & memberships</h3>
              <UsersStats.MarketingMetrics className="grid gap-2 text-sm [&_dt]:text-muted-foreground [&_dd]:font-mono" />
            </div>
          </UsersStats.Overview>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quick links</CardTitle>
          <CardDescription>Jump to common operator tasks</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
            onClick={() => navigateAdmin("/admin/hosts")}
          >
            Host directory
          </button>
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
            onClick={() => navigateAdmin("/admin/lookup")}
          >
            Email lookup
          </button>
        </CardContent>
      </Card>
    </div>
  );
}

export function OverviewPage() {
  return <OverviewContent />;
}
