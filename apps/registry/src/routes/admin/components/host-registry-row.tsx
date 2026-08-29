import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type RegistryHostSummaryItem, useUsersStats } from "@/routes/admin/ui";

type OriginRequest = {
  id: string;
  origin: string;
  status: string;
  requestedAtMs: number;
};

type QuotaRequest = {
  id: string;
  requestedIncluded: number;
  status: string;
  requestedAtMs: number;
};

export function HostRegistryRow({ host }: { host: RegistryHostSummaryItem }) {
  const { refetchSummary } = useUsersStats();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [participationEnabled, setParticipationEnabled] = useState(
    host.registryParticipationEnabled,
  );
  const [quotaIncluded, setQuotaIncluded] = useState(host.trustedOriginQuota.included);
  const [pendingRequests, setPendingRequests] = useState<OriginRequest[]>([]);
  const [pendingQuotaRequests, setPendingQuotaRequests] = useState<QuotaRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const active = host.status === "active";
  const participationId = `host-registry-participation-${host.id}`;

  useEffect(() => {
    void (async () => {
      setLoadingRequests(true);
      try {
        const [originRes, quotaRes] = await Promise.all([
          fetch(`/admin/api/hosts/${host.id}/origin-requests`),
          fetch(`/admin/api/hosts/${host.id}/quota-requests`),
        ]);
        const originJson = (await originRes.json().catch(() => ({}))) as {
          pending?: OriginRequest[];
        };
        const quotaJson = (await quotaRes.json().catch(() => ({}))) as {
          pending?: QuotaRequest[];
        };
        if (originRes.ok && Array.isArray(originJson.pending)) {
          setPendingRequests(originJson.pending);
        }
        if (quotaRes.ok && Array.isArray(quotaJson.pending)) {
          setPendingQuotaRequests(quotaJson.pending);
        }
      } finally {
        setLoadingRequests(false);
      }
    })();
  }, [host.id]);

  async function saveRegistrySettings(
    nextParticipation: boolean,
    nextQuota: number,
  ): Promise<void> {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/admin/api/hosts/${host.id}/registry`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registryParticipationEnabled: nextParticipation,
          includedTrustedOrigins: nextQuota,
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? `Update failed (${res.status})`);
      }
      await refetchSummary();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function reviewRequest(requestId: string, action: "approve" | "reject"): Promise<void> {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(
        `/admin/api/hosts/${host.id}/origin-requests/${requestId}/${action}`,
        { method: "POST" },
      );
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? `${action} failed (${res.status})`);
      }
      const listRes = await fetch(`/admin/api/hosts/${host.id}/origin-requests`);
      const listJson = (await listRes.json().catch(() => ({}))) as { pending?: OriginRequest[] };
      if (listRes.ok && Array.isArray(listJson.pending)) {
        setPendingRequests(listJson.pending);
      }
      await refetchSummary();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Review failed");
    } finally {
      setSaving(false);
    }
  }

  async function reviewQuotaRequest(
    requestId: string,
    action: "approve" | "reject",
  ): Promise<void> {
    setError(null);
    setSaving(true);
    const pending = pendingQuotaRequests.find((item) => item.id === requestId);
    try {
      const res = await fetch(`/admin/api/hosts/${host.id}/quota-requests/${requestId}/${action}`, {
        method: "POST",
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? `${action} failed (${res.status})`);
      }
      if (action === "approve" && pending !== undefined) {
        setQuotaIncluded(pending.requestedIncluded);
      }
      const listRes = await fetch(`/admin/api/hosts/${host.id}/quota-requests`);
      const listJson = (await listRes.json().catch(() => ({}))) as { pending?: QuotaRequest[] };
      if (listRes.ok && Array.isArray(listJson.pending)) {
        setPendingQuotaRequests(listJson.pending);
      }
      await refetchSummary();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Review failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 text-sm" data-slot="host-registry-row">
      <p className="text-muted-foreground">
        Quota: {host.trustedOriginQuota.used} approved, {host.trustedOriginQuota.pending} pending /{" "}
        {host.trustedOriginQuota.included} included
      </p>
      {error !== null ? (
        <p className="text-destructive" data-slot="host-registry-error">
          {error}
        </p>
      ) : null}

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Approved trusted origins</Label>
        {host.trustedOrigins.length === 0 ? (
          <p className="text-muted-foreground">No approved origins yet.</p>
        ) : (
          <ul className="space-y-1 font-mono">
            {host.trustedOrigins.map((origin) => (
              <li key={origin}>{origin}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Pending origin requests</Label>
        {loadingRequests ? (
          <p className="text-muted-foreground">Loading requests…</p>
        ) : pendingRequests.length === 0 ? (
          <p className="text-muted-foreground">No pending origin requests.</p>
        ) : (
          <ul className="space-y-2">
            {pendingRequests.map((request) => (
              <li
                key={request.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate font-mono">{request.origin}</span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={saving}
                    onClick={() => void reviewRequest(request.id, "approve")}
                  >
                    Approve
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={saving}
                    onClick={() => void reviewRequest(request.id, "reject")}
                  >
                    Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Pending quota requests</Label>
        {loadingRequests ? (
          <p className="text-muted-foreground">Loading requests…</p>
        ) : pendingQuotaRequests.length === 0 ? (
          <p className="text-muted-foreground">No pending quota requests.</p>
        ) : (
          <ul className="space-y-2">
            {pendingQuotaRequests.map((request) => (
              <li
                key={request.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <span>
                  Request {request.requestedIncluded} included (current{" "}
                  {host.trustedOriginQuota.included})
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={saving}
                    onClick={() => void reviewQuotaRequest(request.id, "approve")}
                  >
                    Approve
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={saving}
                    onClick={() => void reviewQuotaRequest(request.id, "reject")}
                  >
                    Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3 rounded-md border p-3">
        <p className="font-medium">Operator controls</p>
        <div className="flex items-center gap-2">
          <Checkbox
            id={participationId}
            checked={participationEnabled}
            disabled={!active || saving}
            onCheckedChange={async (checked: boolean | "indeterminate") => {
              const next = checked === true;
              setParticipationEnabled(next);
              await saveRegistrySettings(next, quotaIncluded);
            }}
          />
          <Label htmlFor={participationId} className="font-normal">
            Registry participation (CORS / auth)
            {!active ? <span className="text-muted-foreground"> (activate host first)</span> : null}
          </Label>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor={`${participationId}-quota`} className="text-xs text-muted-foreground">
              Origin quota
            </Label>
            <Input
              id={`${participationId}-quota`}
              type="number"
              min={0}
              className="w-24"
              value={quotaIncluded}
              disabled={saving}
              onChange={(e) => setQuotaIncluded(Number.parseInt(e.target.value, 10) || 0)}
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={saving}
            onClick={() => void saveRegistrySettings(participationEnabled, quotaIncluded)}
          >
            Save quota
          </Button>
        </div>
      </div>
    </div>
  );
}
