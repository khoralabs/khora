import type { RegistryHostSummaryItem } from "@khoralabs/users";
import { useUsersStats } from "@khoralabs/users-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function HostRegistryRow({ host }: { host: RegistryHostSummaryItem }) {
  const { refetchSummary } = useUsersStats();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [origins, setOrigins] = useState<string[]>(host.trustedOrigins);
  const [newOrigin, setNewOrigin] = useState("");
  const [participationEnabled, setParticipationEnabled] = useState(
    host.registryParticipationEnabled,
  );
  const active = host.status === "active";
  const participationId = `host-registry-participation-${host.id}`;

  async function saveRegistry(nextOrigins: string[], nextParticipation: boolean): Promise<void> {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/admin/api/hosts/${host.id}/registry`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registryParticipationEnabled: nextParticipation,
          origins: nextOrigins,
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

  return (
    <li className="space-y-3 rounded-md border p-3 text-sm" data-slot="host-registry-row">
      <div className="font-mono">
        {host.slug} — {host.baseUrl} <span className="text-muted-foreground">({host.status})</span>
      </div>
      <p className="text-muted-foreground">
        Quota: {host.trustedOriginQuota.used} / {host.trustedOriginQuota.included} trusted origins
      </p>
      {error !== null ? (
        <p className="text-destructive" data-slot="host-registry-error">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Checkbox
          id={participationId}
          checked={participationEnabled}
          disabled={!active || saving}
          onCheckedChange={async (checked) => {
            const next = checked === true;
            setParticipationEnabled(next);
            await saveRegistry(origins, next);
          }}
        />
        <Label htmlFor={participationId} className="font-normal">
          Registry participation (CORS / auth)
          {!active ? <span className="text-muted-foreground"> (activate host first)</span> : null}
        </Label>
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Trusted origins</Label>
        <ul className="space-y-1">
          {origins.map((origin) => (
            <li key={origin} className="flex items-center gap-2 font-mono">
              <span className="min-w-0 flex-1 truncate">{origin}</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={saving}
                onClick={async () => {
                  const next = origins.filter((item) => item !== origin);
                  setOrigins(next);
                  await saveRegistry(next, participationEnabled);
                }}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <Input
              type="text"
              className="font-mono"
              placeholder="https://your-app.example.com"
              value={newOrigin}
              disabled={saving}
              onChange={(e) => setNewOrigin(e.target.value)}
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={saving || newOrigin.trim().length === 0}
            onClick={async () => {
              const trimmed = newOrigin.trim();
              if (trimmed.length === 0 || origins.includes(trimmed)) {
                return;
              }
              const next = [...origins, trimmed];
              setOrigins(next);
              setNewOrigin("");
              await saveRegistry(next, participationEnabled);
            }}
          >
            Add origin
          </Button>
        </div>
      </div>
    </li>
  );
}

export function HostRegistryParticipation() {
  const { summary, summaryLoading, summaryError } = useUsersStats();

  if (summaryLoading || summaryError !== null) {
    return null;
  }

  const hosts = (summary?.hosts.items ?? []) as RegistryHostSummaryItem[];
  if (hosts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-slot="host-registry-empty">
        No hosts registered. Hosts opt in via POST /v1/hosts/register.
      </p>
    );
  }

  return (
    <div className="space-y-3 border-t pt-4" data-slot="host-registry-participation">
      <div>
        <h3 className="text-sm font-medium">Registry participation</h3>
        <p className="text-sm text-muted-foreground">
          Hosts register explicit browser origins with the registry. When participation is enabled,
          those origins may call registry auth and API routes from the browser.
        </p>
      </div>
      <ul className="space-y-3">
        {hosts.map((host) => (
          <HostRegistryRow
            key={`${host.id}-${host.trustedOrigins.join("|")}-${host.registryParticipationEnabled}`}
            host={host}
          />
        ))}
      </ul>
    </div>
  );
}
