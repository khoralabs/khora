import { useUsersStats } from "@khoralabs/users-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type ActivateResult = {
  managementToken?: string;
  host?: { registrationRequirements?: Array<{ id: string; status: string; detail?: string }> };
};

export function PendingHostActivations() {
  const { summary, summaryLoading, summaryError, refetchSummary } = useUsersStats();
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [activateError, setActivateError] = useState<string | null>(null);
  const [lastToken, setLastToken] = useState<string | null>(null);

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
      {lastToken !== null ? (
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <p className="font-medium">Management token (copy now — shown once)</p>
          <p className="mt-1 break-all font-mono text-xs">{lastToken}</p>
        </div>
      ) : null}
      <ul className="space-y-2">
        {pending.map((host) => (
          <li key={host.id} className="space-y-2 rounded-md border p-2 font-mono text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {host.slug} — {host.baseUrl}
              </span>
              <Button
                type="button"
                size="sm"
                disabled={activatingId === host.id}
                onClick={async () => {
                  setActivateError(null);
                  setLastToken(null);
                  setActivatingId(host.id);
                  try {
                    const res = await fetch(`/admin/api/hosts/${host.id}/activate`, {
                      method: "POST",
                    });
                    const json = (await res.json().catch(() => ({}))) as ActivateResult & {
                      error?: string;
                    };
                    if (!res.ok) {
                      throw new Error(json.error ?? `Activate failed (${res.status})`);
                    }
                    if (typeof json.managementToken === "string") {
                      setLastToken(json.managementToken);
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
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
