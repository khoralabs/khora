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

export function UsersStatsEmailLookup({ className, ...props }: React.ComponentProps<"section">) {
  return <section data-slot="users-stats-email-lookup" className={cn(className)} {...props} />;
}

export function UsersStatsEmailLookupForm({ className, ...props }: React.ComponentProps<"form">) {
  const { lookupEmail, setLookupEmail, runEmailLookup, emailLookupLoading } = useUsersStats();

  return (
    <form
      data-slot="users-stats-email-lookup-form"
      className={cn(className)}
      onSubmit={(e) => {
        e.preventDefault();
        void runEmailLookup();
      }}
      {...props}
    >
      <label htmlFor="users-lookup-email" className="sr-only">
        Email
      </label>
      <input
        id="users-lookup-email"
        name="email"
        type="email"
        value={lookupEmail}
        onChange={(e) => setLookupEmail(e.target.value)}
        placeholder="user@example.com"
        disabled={emailLookupLoading}
      />
      <button type="submit" disabled={emailLookupLoading}>
        {emailLookupLoading ? "…" : "Look up"}
      </button>
    </form>
  );
}

export function UsersStatsEmailLookupResult({ className, ...props }: React.ComponentProps<"div">) {
  const { emailLookup, emailLookupError } = useUsersStats();

  return (
    <div data-slot="users-stats-email-lookup-result" className={cn(className)} {...props}>
      {emailLookupError !== null && <p data-slot="users-stats-error">{emailLookupError}</p>}
      {emailLookup !== null && (
        <>
          <dl className="grid gap-2 text-sm">
            <MetricRow label="Account" value={emailLookup.account?.id ?? "—"} />
            <MetricRow label="Auth user" value={emailLookup.authUser?.id ?? "—"} />
            <MetricRow label="Role" value={emailLookup.authUser?.role ?? "—"} />
            <MetricRow label="Access requests" value={emailLookup.accessRequests.length} />
            <MetricRow label="Marketing consents" value={emailLookup.marketingConsents.length} />
            <MetricRow label="Memberships" value={emailLookup.membershipsCount} />
          </dl>
          {emailLookup.accountEmails.length > 0 && (
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              Emails: {emailLookup.accountEmails.join(", ")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
