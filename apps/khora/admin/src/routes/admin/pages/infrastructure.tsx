import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminStats } from "../../../khora-react";

export function InfrastructurePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Infrastructure</h1>
        <p className="text-sm text-muted-foreground">Catalog and cell pool usage</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Resources</CardTitle>
          <CardDescription>Relay catalog and cell shards</CardDescription>
        </CardHeader>
        <CardContent>
          <AdminStats.Infrastructure className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-medium">Relay catalog</h3>
              <AdminStats.CatalogMetrics className="grid gap-2 text-sm [&_dt]:text-muted-foreground [&_dd]:font-mono" />
            </div>
            <AdminStats.CellUtilizationBar className="relative h-2 overflow-hidden rounded-full bg-muted [&_[data-slot=admin-stats-cell-utilization-fill]]:absolute [&_[data-slot=admin-stats-cell-utilization-fill]]:inset-y-0 [&_[data-slot=admin-stats-cell-utilization-fill]]:left-0 [&_[data-slot=admin-stats-cell-utilization-fill]]:rounded-full [&_[data-slot=admin-stats-cell-utilization-fill]]:bg-primary [&_[data-slot=admin-stats-cell-utilization-label]]:sr-only" />
            <AdminStats.CellGrid className="grid grid-cols-2 gap-2 sm:grid-cols-4 [&_[data-slot=admin-stats-cell-grid-item]]:flex [&_[data-slot=admin-stats-cell-grid-item]]:flex-col [&_[data-slot=admin-stats-cell-grid-item]]:items-start [&_[data-slot=admin-stats-cell-grid-item]]:gap-1 [&_[data-slot=admin-stats-cell-grid-item]]:rounded-md [&_[data-slot=admin-stats-cell-grid-item]]:border [&_[data-slot=admin-stats-cell-grid-item]]:p-2 [&_[data-slot=admin-stats-cell-grid-item]]:text-left [&_[data-slot=admin-stats-cell-grid-item]]:text-xs [&_[data-slot=admin-stats-cell-grid-item][data-selected=true]]:border-primary [&_[data-slot=admin-stats-cell-grid-item-label]]:font-medium [&_[data-slot=admin-stats-cell-grid-item-metrics]]:font-mono [&_[data-slot=admin-stats-cell-grid-item-homes]]:text-muted-foreground" />
            <AdminStats.CellDetail className="space-y-3 rounded-lg border p-4 text-sm [&_[data-slot=admin-stats-cell-detail-header]]:flex [&_[data-slot=admin-stats-cell-detail-header]]:items-center [&_[data-slot=admin-stats-cell-detail-header]]:justify-between [&_[data-slot=admin-stats-cell-detail-metrics]]:grid [&_[data-slot=admin-stats-cell-detail-metrics]]:gap-2 [&_[data-slot=admin-stats-cell-detail-metrics]_dt]:text-muted-foreground [&_[data-slot=admin-stats-cell-detail-metrics]_dd]:font-mono [&_[data-slot=admin-stats-cell-detail-authors]]:space-y-1 [&_[data-slot=admin-stats-cell-detail-authors]_li]:flex [&_[data-slot=admin-stats-cell-detail-authors]_li]:justify-between [&_[data-slot=admin-stats-cell-detail-authors]_li]:gap-4 [&_[data-slot=admin-stats-cell-detail-authors]_li]:font-mono [&_[data-slot=admin-stats-cell-detail-authors]_li]:text-xs" />
          </AdminStats.Infrastructure>
        </CardContent>
      </Card>
    </div>
  );
}
