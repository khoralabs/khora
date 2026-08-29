import type * as React from "react";
import { cn } from "../cn.ts";
import { useUsersStats } from "../context";

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
  if (loading) return <p data-slot="users-stats-loading">{loadingLabel}</p>;
  if (error !== null) return <p data-slot="users-stats-error">{error}</p>;
  return null;
}

export function UsersStatsOverview({ className, ...props }: React.ComponentProps<"section">) {
  return <section data-slot="users-stats-overview" className={cn(className)} {...props} />;
}

export function UsersStatsAccountsMetrics({ className, ...props }: React.ComponentProps<"dl">) {
  const { summary, summaryLoading, summaryError } = useUsersStats();

  return (
    <dl data-slot="users-stats-accounts-metrics" className={cn(className)} {...props}>
      <LoadingOrError loading={summaryLoading} error={summaryError} />
      {!summaryLoading && summaryError === null && summary !== null && (
        <>
          <MetricRow label="Total accounts" value={summary.accounts.total} />
          <MetricRow label="Active" value={summary.accounts.active} />
          <MetricRow label="Suspended" value={summary.accounts.suspended} />
        </>
      )}
    </dl>
  );
}

export function UsersStatsMarketingMetrics({ className, ...props }: React.ComponentProps<"dl">) {
  const { summary, summaryLoading, summaryError } = useUsersStats();

  return (
    <dl data-slot="users-stats-marketing-metrics" className={cn(className)} {...props}>
      <LoadingOrError loading={summaryLoading} error={summaryError} />
      {!summaryLoading && summaryError === null && summary !== null && (
        <>
          <MetricRow label="Total consents" value={summary.marketingConsents.total} />
          <MetricRow label="Active" value={summary.marketingConsents.active} />
          <MetricRow label="Opted out" value={summary.marketingConsents.optedOut} />
          <MetricRow label="Memberships" value={summary.memberships.total} />
        </>
      )}
    </dl>
  );
}
