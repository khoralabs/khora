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

export function AdminStatsNetworkActivity({
  className,
  ...props
}: React.ComponentProps<"section">) {
  const { summary, summaryLoading, summaryError } = useAdminStats();

  return (
    <section data-slot="admin-stats-network-activity" className={cn(className)} {...props}>
      {summaryLoading && <p data-slot="admin-stats-loading">Loading…</p>}
      {summaryError !== null && <p data-slot="admin-stats-error">{summaryError}</p>}
      {!summaryLoading && summaryError === null && summary !== null && (
        <dl className="grid gap-2 sm:grid-cols-2">
          <MetricRow
            label="Registered agents"
            value={summary.networkActivity.heartbeat.registeredAgents}
          />
          <MetricRow label="Probes this week" value={summary.networkActivity.probesThisWeek} />
          <MetricRow
            label="Rooms created this week"
            value={summary.networkActivity.roomsCreatedThisWeek}
          />
          <MetricRow
            label="Total rooms created"
            value={summary.networkActivity.totalRoomsCreated}
          />
          <MetricRow
            label="Heartbeat (24h)"
            value={summary.networkActivity.heartbeat.activeLast24h}
          />
          <MetricRow
            label="Heartbeat (7d)"
            value={summary.networkActivity.heartbeat.activeLast7d}
          />
          <MetricRow
            label="Silent heartbeat (7d+)"
            value={summary.networkActivity.heartbeat.silent7dPlus}
          />
          <MetricRow
            label="Ever posted status"
            value={summary.networkActivity.heartbeat.withStatusPost}
          />
        </dl>
      )}
    </section>
  );
}
