import type * as React from "react";
import { cn } from "../cn.ts";
import { useAdminStats } from "../context.tsx";

function MetricRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function AdminStatsOperations({ className, ...props }: React.ComponentProps<"section">) {
  return <section data-slot="admin-stats-operations" className={cn(className)} {...props} />;
}

export function AdminStatsInvitesMetrics({ className, ...props }: React.ComponentProps<"dl">) {
  const { summary, summaryLoading, summaryError } = useAdminStats();

  if (summaryLoading) {
    return (
      <dl data-slot="admin-stats-invites-metrics" className={cn(className)} {...props}>
        <p data-slot="admin-stats-loading">Loading…</p>
      </dl>
    );
  }
  if (summaryError !== null) {
    return (
      <dl data-slot="admin-stats-invites-metrics" className={cn(className)} {...props}>
        <p data-slot="admin-stats-error">{summaryError}</p>
      </dl>
    );
  }
  if (summary === null) return null;

  const { invites } = summary;

  return (
    <dl data-slot="admin-stats-invites-metrics" className={cn(className)} {...props}>
      <MetricRow label="Invites (total)" value={invites.configured ? invites.total : "—"} />
      <MetricRow label="Invites consumed" value={invites.configured ? invites.consumed : "—"} />
      <MetricRow label="Invites unconsumed" value={invites.configured ? invites.unconsumed : "—"} />
    </dl>
  );
}

export function AdminStatsTeardownMetrics({ className, ...props }: React.ComponentProps<"dl">) {
  const { summary, summaryLoading, summaryError } = useAdminStats();

  if (summaryLoading) {
    return (
      <dl data-slot="admin-stats-teardown-metrics" className={cn(className)} {...props}>
        <p data-slot="admin-stats-loading">Loading…</p>
      </dl>
    );
  }
  if (summaryError !== null) {
    return (
      <dl data-slot="admin-stats-teardown-metrics" className={cn(className)} {...props}>
        <p data-slot="admin-stats-error">{summaryError}</p>
      </dl>
    );
  }
  if (summary === null) return null;

  const { teardown } = summary;

  return (
    <dl data-slot="admin-stats-teardown-metrics" className={cn(className)} {...props}>
      <MetricRow label="Teardown pending" value={teardown.pending} />
      <MetricRow label="Teardown running" value={teardown.running} />
      <MetricRow label="Teardown active" value={teardown.active} />
      <MetricRow label="Teardown completed" value={teardown.completed} />
      <MetricRow label="Teardown failed" value={teardown.failed} />
    </dl>
  );
}
