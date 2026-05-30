import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type RegistryState =
  | { loading: true }
  | { loading: false; configured: false; message: string }
  | {
      loading: false;
      configured: true;
      status?: string;
      message?: string;
      slug?: string;
      participationEnabled?: boolean;
      origins?: string[];
      quota?: { used: number; included: number };
      serverOrigin?: string;
      trustBaseUrlOriginConfigured?: boolean;
    };

export function HostRegistryCard() {
  const [state, setState] = useState<RegistryState>({ loading: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [origins, setOrigins] = useState<string[]>([]);
  const [newOrigin, setNewOrigin] = useState("");
  const [participationEnabled, setParticipationEnabled] = useState(false);

  const loadRegistry = useCallback(async (): Promise<void> => {
    setError(null);
    setState({ loading: true });
    const res = await fetch("/admin/api/registry");
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
      error?: string;
    };
    if (!res.ok) {
      setState({
        loading: false,
        configured: false,
        message: typeof json.error === "string" ? json.error : "Failed to load registry state",
      });
      return;
    }
    if (json.configured !== true) {
      setState({
        loading: false,
        configured: false,
        message:
          typeof json.message === "string"
            ? json.message
            : "Registry participation is not configured",
      });
      return;
    }
    if (json.status === "pending-token") {
      setState({
        loading: false,
        configured: true,
        status: "pending-token",
        message: typeof json.message === "string" ? json.message : undefined,
        slug: typeof json.slug === "string" ? json.slug : undefined,
      });
      return;
    }
    const nextOrigins = Array.isArray(json.origins)
      ? json.origins.filter((item): item is string => typeof item === "string")
      : [];
    setOrigins(nextOrigins);
    setParticipationEnabled(json.participationEnabled === true);
    setState({
      loading: false,
      configured: true,
      slug: typeof json.slug === "string" ? json.slug : undefined,
      status: typeof json.status === "string" ? json.status : undefined,
      participationEnabled: json.participationEnabled === true,
      origins: nextOrigins,
      quota:
        typeof json.quota === "object" && json.quota !== null
          ? (json.quota as { used: number; included: number })
          : undefined,
      serverOrigin: typeof json.serverOrigin === "string" ? json.serverOrigin : undefined,
      trustBaseUrlOriginConfigured: json.trustBaseUrlOriginConfigured === true,
    });
  }, []);

  useEffect(() => {
    void loadRegistry();
  }, [loadRegistry]);

  async function saveRegistry(nextOrigins: string[], nextParticipation: boolean): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/admin/api/registry", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participationEnabled: nextParticipation,
          origins: nextOrigins,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? `Update failed (${res.status})`);
      }
      await loadRegistry();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  if (state.loading) {
    return <p className="text-sm text-muted-foreground">Loading registry state…</p>;
  }

  if (!state.configured) {
    return <p className="text-sm text-muted-foreground">{state.message}</p>;
  }

  if (state.status === "pending-token") {
    return (
      <div className="space-y-2 text-sm">
        <p className="text-muted-foreground">{state.message}</p>
        {state.slug !== undefined ? (
          <p>
            Host slug: <span className="font-mono">{state.slug}</span>
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3" data-slot="host-registry-card">
      {state.slug !== undefined ? (
        <p className="text-sm text-muted-foreground">
          Host <span className="font-mono text-foreground">{state.slug}</span>
          {state.status !== undefined ? ` (${state.status})` : null}
        </p>
      ) : null}
      {state.quota !== undefined ? (
        <p className="text-sm text-muted-foreground">
          Quota: {state.quota.used} / {state.quota.included} trusted origins
        </p>
      ) : null}
      {state.trustBaseUrlOriginConfigured && state.serverOrigin !== undefined ? (
        <p className="text-sm text-muted-foreground">
          Server origin included via config:{" "}
          <span className="font-mono text-foreground">{state.serverOrigin}</span>
        </p>
      ) : null}
      {error !== null ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex items-center gap-2">
        <Checkbox
          id="host-registry-participation"
          checked={participationEnabled}
          disabled={saving || state.status !== "active"}
          onCheckedChange={async (checked: boolean | "indeterminate") => {
            const next = checked === true;
            setParticipationEnabled(next);
            await saveRegistry(origins, next);
          }}
        />
        <Label htmlFor="host-registry-participation" className="font-normal">
          Registry participation
          {state.status !== "active" ? (
            <span className="text-muted-foreground"> (activate host in registry admin first)</span>
          ) : null}
        </Label>
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Trusted origins</Label>
        <ul className="space-y-1">
          {origins.map((origin) => (
            <li key={origin} className="flex items-center gap-2 font-mono text-sm">
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
          <Input
            type="text"
            className="min-w-0 flex-1 font-mono"
            placeholder="https://your-app.example.com"
            value={newOrigin}
            disabled={saving}
            onChange={(e) => setNewOrigin(e.target.value)}
          />
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
    </div>
  );
}
