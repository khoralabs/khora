import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RegistrationRequirementState } from "../../registry-types";

type RegistryState = Record<string, unknown> & {
  configured?: boolean;
  message?: string;
  error?: string;
  status?: string;
  slug?: string;
  registryUrl?: string;
  publicBaseUrl?: string;
  displayName?: string;
  trustLevel?: string;
  requirements?: RegistrationRequirementState[];
  participationEnabled?: boolean;
  origins?: string[];
  quota?: { used: number; included: number };
  serverOrigin?: string;
  trustBaseUrlOriginConfigured?: boolean;
  hasManagementToken?: boolean;
  hasRegistrationSecret?: boolean;
  managementToken?: string;
  registrationSecret?: string;
};

function requirementLabel(id: RegistrationRequirementState["id"]): string {
  if (id === "health_check") return "Health check";
  if (id === "operator_approval") return "Operator approval";
  return "Payment";
}

function RequirementList({ requirements }: { requirements: RegistrationRequirementState[] }) {
  return (
    <ul className="space-y-2">
      {requirements.map((item) => (
        <li
          key={item.id}
          className="flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm"
        >
          <div>
            <p className="font-medium">{requirementLabel(item.id)}</p>
            {item.detail !== undefined ? (
              <p className="text-xs text-muted-foreground">{item.detail}</p>
            ) : null}
          </div>
          <span className="font-mono text-xs uppercase">{item.status}</span>
        </li>
      ))}
    </ul>
  );
}

export function HostRegistryCard() {
  const [state, setState] = useState<RegistryState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registryUrl, setRegistryUrl] = useState("http://localhost:4000");
  const [slug, setSlug] = useState("");
  const [publicBaseUrl, setPublicBaseUrl] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [origins, setOrigins] = useState<string[]>([]);
  const [newOrigin, setNewOrigin] = useState("");
  const [participationEnabled, setParticipationEnabled] = useState(false);

  const loadRegistry = useCallback(async (): Promise<void> => {
    setError(null);
    setLoading(true);
    const res = await fetch("/admin/api/registry");
    const json = (await res.json().catch(() => ({}))) as RegistryState;
    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "Failed to load registry state");
      setState(json);
      setLoading(false);
      return;
    }
    setState(json);
    if (typeof json.registryUrl === "string") setRegistryUrl(json.registryUrl);
    if (typeof json.slug === "string") setSlug(json.slug);
    if (typeof json.publicBaseUrl === "string") setPublicBaseUrl(json.publicBaseUrl);
    if (typeof json.displayName === "string") setDisplayName(json.displayName);
    if (Array.isArray(json.origins)) {
      setOrigins(json.origins.filter((item): item is string => typeof item === "string"));
    }
    if (json.participationEnabled === true) setParticipationEnabled(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadRegistry();
  }, [loadRegistry]);

  async function saveConfig(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/admin/api/registry/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registryUrl, slug, publicBaseUrl, displayName }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? `Save failed (${res.status})`);
      }
      await loadRegistry();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function registerHost(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      await saveConfig();
      const res = await fetch("/admin/api/registry/register", { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? `Register failed (${res.status})`);
      }
      await loadRegistry();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Register failed");
    } finally {
      setSaving(false);
    }
  }

  async function claimActivation(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/admin/api/registry/claim", { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? `Claim failed (${res.status})`);
      }
      await loadRegistry();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Claim failed");
    } finally {
      setSaving(false);
    }
  }

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

  if (loading || state === null) {
    return <p className="text-sm text-muted-foreground">Loading registry state…</p>;
  }

  const status = typeof state.status === "string" ? state.status : undefined;
  const requirements = Array.isArray(state.requirements)
    ? state.requirements.filter(
        (item): item is RegistrationRequirementState =>
          typeof item === "object" && item !== null && typeof item.id === "string",
      )
    : [];
  const canManageOrigins = status === "active" && state.hasManagementToken === true;

  return (
    <div className="space-y-6" data-slot="host-registry-card">
      {error !== null ? <p className="text-sm text-destructive">{error}</p> : null}

      <section className="space-y-3 rounded-lg border p-4">
        <div>
          <h2 className="text-sm font-medium">Connection</h2>
          <p className="text-xs text-muted-foreground">Registry URL and host identity</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="registry-url">Registry URL</Label>
            <Input
              id="registry-url"
              value={registryUrl}
              disabled={saving}
              className="font-mono"
              onChange={(e) => setRegistryUrl(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="registry-slug">Host slug</Label>
            <Input
              id="registry-slug"
              value={slug}
              disabled={saving}
              className="font-mono"
              onChange={(e) => setSlug(e.target.value)}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="registry-base-url">Public base URL</Label>
            <Input
              id="registry-base-url"
              value={publicBaseUrl}
              disabled={saving}
              className="font-mono"
              onChange={(e) => setPublicBaseUrl(e.target.value)}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="registry-display-name">Display name</Label>
            <Input
              id="registry-display-name"
              value={displayName}
              disabled={saving}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={saving} onClick={() => void saveConfig()}>
            Save connection
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={saving || slug.trim().length === 0}
            onClick={() => void registerHost()}
          >
            Register with registry
          </Button>
        </div>
      </section>

      {(status !== undefined || requirements.length > 0) && !canManageOrigins ? (
        <section className="space-y-3 rounded-lg border p-4">
          <div>
            <h2 className="text-sm font-medium">Registration</h2>
            <p className="text-xs text-muted-foreground">
              {typeof state.trustLevel === "string"
                ? `Registry trust level: ${state.trustLevel}`
                : "Registration status"}
            </p>
          </div>
          {status !== undefined ? (
            <p className="text-sm">
              Status: <span className="font-mono">{status}</span>
            </p>
          ) : null}
          {typeof state.message === "string" ? (
            <p className="text-sm text-muted-foreground">{state.message}</p>
          ) : null}
          {requirements.length > 0 ? <RequirementList requirements={requirements} /> : null}
          {state.hasRegistrationSecret === true && status !== "active" ? (
            <Button
              type="button"
              size="sm"
              disabled={saving}
              onClick={() => void claimActivation()}
            >
              Retry claim / check activation
            </Button>
          ) : null}
        </section>
      ) : null}

      {canManageOrigins ? (
        <section className="space-y-3 rounded-lg border p-4">
          <div>
            <h2 className="text-sm font-medium">Participation and trusted origins</h2>
            <p className="text-xs text-muted-foreground">
              Browser origins allowed to call registry APIs for this host
            </p>
          </div>
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
          <div className="flex items-center gap-2">
            <Checkbox
              id="host-registry-participation"
              checked={participationEnabled}
              disabled={saving}
              onCheckedChange={async (checked: boolean | "indeterminate") => {
                const next = checked === true;
                setParticipationEnabled(next);
                await saveRegistry(origins, next);
              }}
            />
            <Label htmlFor="host-registry-participation" className="font-normal">
              Registry participation
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
        </section>
      ) : null}
    </div>
  );
}
