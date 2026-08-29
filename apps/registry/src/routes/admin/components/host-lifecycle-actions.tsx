import {
  type RegistryHostSummaryItem,
  useUsersStats,
} from "@khoralabs/registry-catalog-react/admin";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { navigateAdmin } from "../use-pathname.ts";

export function HostLifecycleActions({ host }: { host: RegistryHostSummaryItem }) {
  const { refetchSummary } = useUsersStats();
  const [busy, setBusy] = useState<"suspend" | "reactivate" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmSlug, setDeleteConfirmSlug] = useState("");

  const canSuspend = host.status === "active" || host.status === "pending";
  const canReactivate = host.status === "suspended";
  const canDelete = host.status === "suspended" || host.status === "pending";
  const deleteConfirmed = deleteConfirmSlug.trim() === host.slug;

  if (!canSuspend && !canReactivate && !canDelete) {
    return null;
  }

  async function runAction(
    action: "suspend" | "reactivate" | "delete",
    request: () => Promise<Response>,
  ) {
    setError(null);
    setBusy(action);
    try {
      const res = await request();
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? `${action} failed (${res.status})`);
      }
      if (action === "delete") {
        await refetchSummary();
        navigateAdmin("/admin/hosts");
        return;
      }
      await refetchSummary();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `${action} failed`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card data-slot="host-lifecycle-actions">
      <CardHeader>
        <CardTitle>Host lifecycle</CardTitle>
        <CardDescription>
          Suspend removes the host from the public catalog and CORS origins. Permanent delete frees
          the slug for re-registration.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error !== null ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex flex-wrap gap-2">
          {canSuspend ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() => {
                if (
                  !window.confirm(
                    `Suspend ${host.slug}? It will be hidden from the public host list and trusted origins until reactivated.`,
                  )
                ) {
                  return;
                }
                void runAction("suspend", () =>
                  fetch(`/admin/api/hosts/${host.id}/suspend`, { method: "POST" }),
                );
              }}
            >
              {busy === "suspend" ? "Suspending…" : "Suspend host"}
            </Button>
          ) : null}

          {canReactivate ? (
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={busy !== null}
              onClick={() => {
                void runAction("reactivate", () =>
                  fetch(`/admin/api/hosts/${host.id}/reactivate`, { method: "POST" }),
                );
              }}
            >
              {busy === "reactivate" ? "Reactivating…" : "Reactivate host"}
            </Button>
          ) : null}
        </div>

        {canDelete ? (
          <div className="space-y-2 rounded-md border border-destructive/30 p-3">
            <p className="text-sm font-medium text-destructive">Delete permanently</p>
            <p className="text-xs text-muted-foreground">
              This removes the host, all trusted origins, and memberships. Type{" "}
              <span className="font-mono">{host.slug}</span> to confirm.
            </p>
            <input
              type="text"
              className="flex h-9 w-full max-w-sm rounded-md border bg-background px-3 py-1 font-mono text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              placeholder={host.slug}
              value={deleteConfirmSlug}
              onChange={(e) => setDeleteConfirmSlug(e.target.value)}
              aria-label="Confirm host slug"
            />
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={busy !== null || !deleteConfirmed}
              onClick={() => {
                void runAction("delete", () =>
                  fetch(`/admin/api/hosts/${host.id}`, { method: "DELETE" }),
                );
              }}
            >
              {busy === "delete" ? "Deleting…" : "Delete permanently"}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
