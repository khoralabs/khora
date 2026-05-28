import type * as React from "react";
import { cn } from "../cn.ts";
import { findCellShard, formatBytes, formatShardLabel, useAdminStats } from "../context.tsx";

function MetricRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function LoadingOrError({
  loading,
  error,
  loadingLabel = "Loading…",
}: {
  loading: boolean;
  error: string | null;
  loadingLabel?: string;
}) {
  if (loading) return <p data-slot="admin-stats-loading">{loadingLabel}</p>;
  if (error !== null) return <p data-slot="admin-stats-error">{error}</p>;
  return null;
}

export function AdminStatsInfrastructure({ className, ...props }: React.ComponentProps<"section">) {
  return <section data-slot="admin-stats-infrastructure" className={cn(className)} {...props} />;
}

export function AdminStatsCatalogMetrics({ className, ...props }: React.ComponentProps<"dl">) {
  const { summary, summaryLoading, summaryError } = useAdminStats();

  return (
    <dl data-slot="admin-stats-catalog-metrics" className={cn(className)} {...props}>
      {summaryLoading && <p data-slot="admin-stats-loading">Loading…</p>}
      {summaryError !== null && <p data-slot="admin-stats-error">{summaryError}</p>}
      {!summaryLoading && summaryError === null && summary !== null && (
        <>
          <MetricRow label="Registered users" value={summary.catalog.registeredUsers} />
          <MetricRow label="Projection rows" value={summary.catalog.projectionRows} />
          <MetricRow label="Standing queries" value={summary.catalog.standingQueries} />
        </>
      )}
    </dl>
  );
}

export function AdminStatsFramesMetrics({ className, ...props }: React.ComponentProps<"dl">) {
  const { summary, summaryLoading, summaryError } = useAdminStats();

  return (
    <dl data-slot="admin-stats-frames-metrics" className={cn(className)} {...props}>
      {summaryLoading && <p data-slot="admin-stats-loading">Loading…</p>}
      {summaryError !== null && <p data-slot="admin-stats-error">{summaryError}</p>}
      {!summaryLoading && summaryError === null && summary !== null && (
        <>
          <MetricRow label="Active rooms" value={summary.frames.activeRooms} />
          <MetricRow label="Stored frames" value={summary.frames.totalFrames} />
        </>
      )}
    </dl>
  );
}

export function AdminStatsCellUtilizationBar({ className, ...props }: React.ComponentProps<"div">) {
  const { summary, summaryLoading, summaryError } = useAdminStats();
  if (summaryLoading || summaryError !== null || summary === null) return null;

  const { inUseCount, poolCount } = summary.cells;
  const ratio = poolCount > 0 ? (inUseCount / poolCount) * 100 : 0;

  return (
    <div data-slot="admin-stats-cell-utilization" className={cn(className)} {...props}>
      <div
        data-slot="admin-stats-cell-utilization-fill"
        style={{ width: `${ratio}%` }}
        aria-hidden
      />
      <span data-slot="admin-stats-cell-utilization-label">
        {inUseCount} / {poolCount} cells in use
      </span>
    </div>
  );
}

export function AdminStatsCellGrid({ className, ...props }: React.ComponentProps<"div">) {
  const { summary, summaryLoading, summaryError } = useAdminStats();

  return (
    <div data-slot="admin-stats-cell-grid" className={cn(className)} {...props}>
      {summaryLoading && <p data-slot="admin-stats-loading">Loading…</p>}
      {summaryError !== null && <p data-slot="admin-stats-error">{summaryError}</p>}
      {!summaryLoading &&
        summaryError === null &&
        summary?.cells.shards.map((shard) => (
          <AdminStatsCellGridItem key={shard.cellId} cellId={shard.cellId} />
        ))}
    </div>
  );
}

export type AdminStatsCellGridItemProps = React.ComponentProps<"button"> & {
  cellId: string;
};

export function AdminStatsCellGridItem({
  cellId,
  className,
  onClick,
  ...props
}: AdminStatsCellGridItemProps) {
  const { summary, selectedCellId, selectCell } = useAdminStats();
  const shard = findCellShard(summary, cellId);
  if (shard === undefined) return null;

  const selected = selectedCellId === cellId;

  return (
    <button
      type="button"
      data-slot="admin-stats-cell-grid-item"
      data-selected={selected ? "true" : "false"}
      aria-pressed={selected}
      className={cn(className)}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) {
          selectCell(selected ? null : cellId);
        }
      }}
      {...props}
    >
      <span data-slot="admin-stats-cell-grid-item-label">{formatShardLabel(cellId)}</span>
      <span data-slot="admin-stats-cell-grid-item-metrics">
        {shard.outboxCount} out · {shard.inboxCount} in
      </span>
      <span data-slot="admin-stats-cell-grid-item-homes">{shard.homePrincipals} homes</span>
    </button>
  );
}

export function AdminStatsCellDetail({ className, ...props }: React.ComponentProps<"section">) {
  const { selectedCellId, cellDetail, cellDetailLoading, cellDetailError, selectCell } =
    useAdminStats();

  if (selectedCellId === null) return null;

  return (
    <section data-slot="admin-stats-cell-detail" className={cn(className)} {...props}>
      <header data-slot="admin-stats-cell-detail-header">
        <h3 data-slot="admin-stats-cell-detail-title">{formatShardLabel(selectedCellId)}</h3>
        <button
          type="button"
          data-slot="admin-stats-cell-detail-close"
          onClick={() => selectCell(null)}
        >
          Close
        </button>
      </header>
      <LoadingOrError loading={cellDetailLoading} error={cellDetailError} />
      {cellDetail !== null && !cellDetailLoading && cellDetailError === null && (
        <dl data-slot="admin-stats-cell-detail-metrics">
          <MetricRow label="Provisioned" value={cellDetail.provisioned ? "yes" : "no"} />
          <MetricRow label="File size" value={formatBytes(cellDetail.fileSizeBytes)} />
          <MetricRow label="Outbox rows" value={cellDetail.outboxCount} />
          <MetricRow label="Inbox rows" value={cellDetail.inboxCount} />
          <MetricRow label="Outbox principals" value={cellDetail.outboxPrincipals} />
          <MetricRow label="Inbox recipients" value={cellDetail.inboxRecipients} />
          <MetricRow label="Home principals" value={cellDetail.homePrincipals} />
        </dl>
      )}
      {cellDetail !== null && cellDetail.topOutboxAuthors.length > 0 && (
        <ol data-slot="admin-stats-cell-detail-authors">
          {cellDetail.topOutboxAuthors.map((author) => (
            <li key={author.principalId}>
              <span>{author.principalId}</span>
              <span>{author.count}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
