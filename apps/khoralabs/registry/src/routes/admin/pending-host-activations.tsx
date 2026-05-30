import { useUsersStats } from "@khoralabs/users-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function PendingHostActivations() {
  const { summary, summaryLoading, summaryError, refetchSummary } = useUsersStats();
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [activateError, setActivateError] = useState<string | null>(null);

  if (summaryLoading || summaryError !== null) {
    return null;
  }

  const pending = (summary?.hosts.items ?? []).filter((h) => h.status === "pending");
  if (pending.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2 border-t pt-4" data-slot="pending-host-activations">
      <h3 className="text-sm font-medium">Pending activation</h3>
      {activateError !== null ? (
        <p className="text-sm text-destructive" data-slot="pending-host-activate-error">
          {activateError}
        </p>
      ) : null}
      <ul className="space-y-2">
        {pending.map((host) => (
          <li
            key={host.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 font-mono text-sm"
          >
            <span>
              {host.slug} — {host.baseUrl}
            </span>
            <Button
              type="button"
              size="sm"
              disabled={activatingId === host.id}
              onClick={async () => {
                setActivateError(null);
                setActivatingId(host.id);
                try {
                  const res = await fetch(`/admin/api/hosts/${host.id}/activate`, {
                    method: "POST",
                  });
                  if (!res.ok) {
                    const json = (await res.json().catch(() => ({}))) as { error?: string };
                    throw new Error(json.error ?? `Activate failed (${res.status})`);
                  }
                  await refetchSummary();
                } catch (err: unknown) {
                  setActivateError(err instanceof Error ? err.message : "Activate failed");
                } finally {
                  setActivatingId(null);
                }
              }}
            >
              {activatingId === host.id ? "Activating…" : "Activate"}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
