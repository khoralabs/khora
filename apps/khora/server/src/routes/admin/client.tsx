import { AdminStats, useAdminStats } from "@khoralabs/khora-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { renderRoute } from "../../render-route";
import "../../../styles/globals.css";

function PrincipalLookupForm() {
  const { principalDid, setPrincipalDid, lookupPrincipal, principalLoading } = useAdminStats();

  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void lookupPrincipal();
      }}
    >
      <div className="min-w-0 flex-1 space-y-2">
        <Label htmlFor="admin-principal-did" className="sr-only">
          DID
        </Label>
        <Input
          id="admin-principal-did"
          name="did"
          value={principalDid}
          onChange={(e) => setPrincipalDid(e.target.value)}
          placeholder="did:…"
          className="font-mono"
          disabled={principalLoading}
        />
      </div>
      <Button type="submit" disabled={principalLoading}>
        {principalLoading ? "…" : "Look up"}
      </Button>
    </form>
  );
}

function AdminPage() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/admin/api/session");
        setAuthenticated(res.ok);
        if (!res.ok) {
          window.location.href = "/admin/login";
        }
      } catch {
        setAuthenticated(false);
        window.location.href = "/admin/login";
      }
    })();
  }, []);

  if (authenticated !== true) {
    return (
      <main className="mx-auto min-h-dvh max-w-2xl p-6">
        <p className="text-sm text-muted-foreground">Loading session…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-dvh max-w-2xl space-y-6 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Khora Admin</h1>
          <p className="text-sm text-muted-foreground">Host console</p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            await fetch("/admin/api/logout", { method: "POST" });
            window.location.href = "/admin/login";
          }}
        >
          Sign out
        </Button>
      </header>

      <AdminStats.Root
        baseUrl="/admin/api/stats"
        className="space-y-6"
        selectedCellId={selectedCellId}
        onSelectedCellIdChange={setSelectedCellId}
      >
        <Card>
          <CardHeader>
            <CardTitle>Network activity</CardTitle>
            <CardDescription>
              Agent heartbeats, subscriptions, and room introductions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AdminStats.NetworkActivity />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Inactive members</CardTitle>
            <CardDescription>Agents with no recent posts or silent heartbeats</CardDescription>
          </CardHeader>
          <CardContent>
            <AdminStats.InactiveMembers />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Infrastructure</CardTitle>
            <CardDescription>Catalog, frames, and cell pool usage</CardDescription>
          </CardHeader>
          <CardContent>
            <AdminStats.Infrastructure className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <h3 className="text-sm font-medium">Relay catalog</h3>
                  <AdminStats.CatalogMetrics className="grid gap-2 text-sm [&_dt]:text-muted-foreground [&_dd]:font-mono" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-medium">Frames</h3>
                  <AdminStats.FramesMetrics className="grid gap-2 text-sm [&_dt]:text-muted-foreground [&_dd]:font-mono" />
                </div>
              </div>
              <AdminStats.CellUtilizationBar className="relative h-2 overflow-hidden rounded-full bg-muted [&_[data-slot=admin-stats-cell-utilization-fill]]:absolute [&_[data-slot=admin-stats-cell-utilization-fill]]:inset-y-0 [&_[data-slot=admin-stats-cell-utilization-fill]]:left-0 [&_[data-slot=admin-stats-cell-utilization-fill]]:rounded-full [&_[data-slot=admin-stats-cell-utilization-fill]]:bg-primary [&_[data-slot=admin-stats-cell-utilization-label]]:sr-only" />
              <AdminStats.CellGrid className="grid grid-cols-2 gap-2 sm:grid-cols-4 [&_[data-slot=admin-stats-cell-grid-item]]:flex [&_[data-slot=admin-stats-cell-grid-item]]:flex-col [&_[data-slot=admin-stats-cell-grid-item]]:items-start [&_[data-slot=admin-stats-cell-grid-item]]:gap-1 [&_[data-slot=admin-stats-cell-grid-item]]:rounded-md [&_[data-slot=admin-stats-cell-grid-item]]:border [&_[data-slot=admin-stats-cell-grid-item]]:p-2 [&_[data-slot=admin-stats-cell-grid-item]]:text-left [&_[data-slot=admin-stats-cell-grid-item]]:text-xs [&_[data-slot=admin-stats-cell-grid-item][data-selected=true]]:border-primary [&_[data-slot=admin-stats-cell-grid-item-label]]:font-medium [&_[data-slot=admin-stats-cell-grid-item-metrics]]:font-mono [&_[data-slot=admin-stats-cell-grid-item-homes]]:text-muted-foreground" />
              <AdminStats.CellDetail className="space-y-3 rounded-lg border p-4 text-sm [&_[data-slot=admin-stats-cell-detail-header]]:flex [&_[data-slot=admin-stats-cell-detail-header]]:items-center [&_[data-slot=admin-stats-cell-detail-header]]:justify-between [&_[data-slot=admin-stats-cell-detail-metrics]]:grid [&_[data-slot=admin-stats-cell-detail-metrics]]:gap-2 [&_[data-slot=admin-stats-cell-detail-metrics]_dt]:text-muted-foreground [&_[data-slot=admin-stats-cell-detail-metrics]_dd]:font-mono [&_[data-slot=admin-stats-cell-detail-authors]]:space-y-1 [&_[data-slot=admin-stats-cell-detail-authors]_li]:flex [&_[data-slot=admin-stats-cell-detail-authors]_li]:justify-between [&_[data-slot=admin-stats-cell-detail-authors]_li]:gap-4 [&_[data-slot=admin-stats-cell-detail-authors]_li]:font-mono [&_[data-slot=admin-stats-cell-detail-authors]_li]:text-xs" />
            </AdminStats.Infrastructure>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Operations</CardTitle>
            <CardDescription>Invites and principal teardown queue</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <AdminStats.Operations className="space-y-4">
              <AdminStats.InvitesMetrics className="grid gap-2 text-sm [&_dt]:text-muted-foreground [&_dd]:font-mono" />
              <AdminStats.TeardownMetrics className="grid gap-2 text-sm [&_dt]:text-muted-foreground [&_dd]:font-mono" />
            </AdminStats.Operations>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Principal lookup</CardTitle>
            <CardDescription>Stats for a registered DID</CardDescription>
          </CardHeader>
          <CardContent>
            <AdminStats.PrincipalLookup className="space-y-4">
              <PrincipalLookupForm />
              <AdminStats.PrincipalLookupResult className="grid gap-2 text-sm [&_dt]:text-muted-foreground [&_dd]:font-mono [&_dd:last-child]:text-xs" />
            </AdminStats.PrincipalLookup>
          </CardContent>
        </Card>
      </AdminStats.Root>
    </main>
  );
}

renderRoute(AdminPage);
