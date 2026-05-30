import type * as React from "react";
import { cn } from "../cn.ts";
import { useAdminStats } from "../context";

function MetricRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function AdminStatsPrincipalLookup({
  className,
  ...props
}: React.ComponentProps<"section">) {
  return <section data-slot="admin-stats-principal-lookup" className={cn(className)} {...props} />;
}

export function AdminStatsPrincipalLookupForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const { principalDid, setPrincipalDid, lookupPrincipal, principalLoading } = useAdminStats();

  return (
    <form
      data-slot="admin-stats-principal-lookup-form"
      className={cn(className)}
      onSubmit={(e) => {
        e.preventDefault();
        void lookupPrincipal();
      }}
      {...props}
    >
      <label htmlFor="admin-principal-did" className="sr-only">
        DID
      </label>
      <input
        id="admin-principal-did"
        name="did"
        value={principalDid}
        onChange={(e) => setPrincipalDid(e.target.value)}
        placeholder="did:…"
        disabled={principalLoading}
      />
      <button type="submit" disabled={principalLoading}>
        {principalLoading ? "…" : "Look up"}
      </button>
    </form>
  );
}

export function AdminStatsPrincipalLookupResult({
  className,
  ...props
}: React.ComponentProps<"dl">) {
  const { principal, principalError } = useAdminStats();

  return (
    <>
      {principalError !== null && <p data-slot="admin-stats-error">{principalError}</p>}
      {principal !== null && (
        <dl data-slot="admin-stats-principal-lookup-result" className={cn(className)} {...props}>
          <MetricRow label="Username" value={principal.username ?? "—"} />
          <MetricRow label="Outbox count" value={principal.outboxCount} />
          <MetricRow label="Subscriptions" value={principal.subscriptionCount} />
          <MetricRow label="Cell" value={principal.cellId} />
        </dl>
      )}
    </>
  );
}
