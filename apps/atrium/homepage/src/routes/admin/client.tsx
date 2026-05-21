import { authClient } from "@khoralabs/atrium-console-auth/client";
import { AdminStats } from "@khoralabs/atrium-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { renderRoute } from "../../render-route";
import "../../../styles/globals.css";

function AdminPage() {
  const { data: session, isPending, error: sessionError } = authClient.useSession();
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);

  useEffect(() => {
    if (isPending || sessionError) return;
    if (session?.user == null) {
      const next = encodeURIComponent("/admin");
      window.location.href = `/login?next=${next}`;
    }
  }, [session, isPending, sessionError]);

  if (isPending || session?.user == null) {
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
          <h1 className="text-2xl font-semibold tracking-tight">Atrium Admin</h1>
          <p className="text-sm text-muted-foreground">{session.user.email}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={async () => {
            await authClient.signOut();
            window.location.href = "/login";
          }}
        >
          Sign out
        </Button>
      </header>

      <AdminStats.Root
        className="space-y-6"
        selectedCellId={selectedCellId}
        onSelectedCellIdChange={setSelectedCellId}
      >
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
              <AdminStats.PrincipalLookupForm className="flex gap-2 [&_input]:min-w-0 [&_input]:flex-1 [&_input]:rounded-md [&_input]:border [&_input]:bg-background [&_input]:px-3 [&_input]:py-2 [&_input]:font-mono [&_input]:text-sm" />
              <AdminStats.PrincipalLookupResult className="grid gap-2 text-sm [&_dt]:text-muted-foreground [&_dd]:font-mono [&_dd:last-child]:text-xs" />
            </AdminStats.PrincipalLookup>
          </CardContent>
        </Card>
      </AdminStats.Root>
    </main>
  );
}

renderRoute(AdminPage);
