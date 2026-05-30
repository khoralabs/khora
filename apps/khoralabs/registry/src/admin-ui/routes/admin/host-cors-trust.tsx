import { type KhoraHost, resolveHostTrustedOrigin } from "@khoralabs/users";
import { useUsersStats } from "@khoralabs/users-react";
import { useState } from "react";
import { Button } from "../../components/ui/button.tsx";

function previewOrigin(host: KhoraHost): string {
  try {
    return resolveHostTrustedOrigin(host);
  } catch {
    return "(invalid base URL)";
  }
}

export function HostCorsTrust() {
  const { summary, summaryLoading, summaryError, refetchSummary } = useUsersStats();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftOrigins, setDraftOrigins] = useState<Record<string, string>>({});

  if (summaryLoading || summaryError !== null) {
    return null;
  }

  const hosts = summary?.hosts.items ?? [];
  if (hosts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-slot="host-cors-empty">
        No hosts registered. Hosts opt in via POST /v1/hosts/register.
      </p>
    );
  }

  return (
    <div className="space-y-3 border-t pt-4" data-slot="host-cors-trust">
      <div>
        <h3 className="text-sm font-medium">CORS trusted origins</h3>
        <p className="text-sm text-muted-foreground">
          Allow browser clients at each host&apos;s origin to call registry APIs. Set client origin
          when the app URL differs from the host API base URL.
        </p>
      </div>
      {error !== null ? (
        <p className="text-sm text-destructive" data-slot="host-cors-error">
          {error}
        </p>
      ) : null}
      <ul className="space-y-3">
        {hosts.map((host) => {
          const active = host.status === "active";
          const draft =
            draftOrigins[host.id] ?? (host.clientOrigin !== null ? host.clientOrigin : "");
          return (
            <li
              key={host.id}
              className="space-y-2 rounded-md border p-3 text-sm"
              data-slot="host-cors-row"
            >
              <div className="font-mono">
                {host.slug} — {host.baseUrl}{" "}
                <span className="text-muted-foreground">({host.status})</span>
              </div>
              <p className="text-muted-foreground">Resolved origin: {previewOrigin(host)}</p>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={host.corsTrusted}
                  disabled={!active || savingId === host.id}
                  onChange={async (e) => {
                    setError(null);
                    setSavingId(host.id);
                    try {
                      const res = await fetch(`/admin/api/hosts/${host.id}/cors`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ corsTrusted: e.target.checked }),
                      });
                      if (!res.ok) {
                        const json = (await res.json().catch(() => ({}))) as { error?: string };
                        throw new Error(json.error ?? `Update failed (${res.status})`);
                      }
                      await refetchSummary();
                    } catch (err: unknown) {
                      setError(err instanceof Error ? err.message : "Update failed");
                    } finally {
                      setSavingId(null);
                    }
                  }}
                />
                <span>Trust for CORS / auth</span>
                {!active ? (
                  <span className="text-muted-foreground">(activate host first)</span>
                ) : null}
              </label>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Client origin (optional)</span>
                  <input
                    type="text"
                    className="rounded-md border bg-background px-2 py-1 font-mono text-sm"
                    placeholder="https://khoralabs.com"
                    value={draft}
                    disabled={savingId === host.id}
                    onChange={(e) => {
                      setDraftOrigins((prev) => ({ ...prev, [host.id]: e.target.value }));
                    }}
                  />
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={savingId === host.id}
                  onClick={async () => {
                    setError(null);
                    setSavingId(host.id);
                    try {
                      const res = await fetch(`/admin/api/hosts/${host.id}/cors`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          clientOrigin: draft.trim().length === 0 ? null : draft.trim(),
                        }),
                      });
                      if (!res.ok) {
                        const json = (await res.json().catch(() => ({}))) as { error?: string };
                        throw new Error(json.error ?? `Update failed (${res.status})`);
                      }
                      setDraftOrigins((prev) => {
                        const next = { ...prev };
                        delete next[host.id];
                        return next;
                      });
                      await refetchSummary();
                    } catch (err: unknown) {
                      setError(err instanceof Error ? err.message : "Update failed");
                    } finally {
                      setSavingId(null);
                    }
                  }}
                >
                  Save origin
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
