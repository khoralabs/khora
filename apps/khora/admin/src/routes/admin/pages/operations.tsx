import { Loader } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AdminStats } from "../../../khora-react";

type AdminInviteRow = {
  preview: string;
  consumed: boolean;
  consumedByDid?: string;
  createdAtMs: number;
  kind: string;
  mintedByDid: string | null;
};

function formatWhen(ms: number): string {
  return new Date(ms).toLocaleString();
}

type HostConfig = {
  populationCurrent: number;
  populationLimit?: number;
};

export function OperationsPage() {
  const [hostConfig, setHostConfig] = useState<HostConfig | null>(null);
  const [hostConfigLoading, setHostConfigLoading] = useState(true);
  const [hostConfigError, setHostConfigError] = useState<string | null>(null);
  const [limitInput, setLimitInput] = useState("");
  const [limitSaving, setLimitSaving] = useState(false);
  const [limitSaveError, setLimitSaveError] = useState<string | null>(null);

  const [invites, setInvites] = useState<AdminInviteRow[]>([]);
  const [invitesConfigured, setInvitesConfigured] = useState<boolean | null>(null);
  const [invitesLoading, setInvitesLoading] = useState(true);
  const [invitesError, setInvitesError] = useState<string | null>(null);
  const [mintLoading, setMintLoading] = useState(false);
  const [mintedToken, setMintedToken] = useState<string | null>(null);
  const [mintError, setMintError] = useState<string | null>(null);

  const loadHostConfig = useCallback(async () => {
    setHostConfigLoading(true);
    setHostConfigError(null);
    try {
      const res = await fetch("/admin/api/host/config");
      const body = (await res.json()) as HostConfig & { error?: string };
      if (!res.ok) {
        throw new Error(typeof body.error === "string" ? body.error : "Failed to load host config");
      }
      setHostConfig(body);
      setLimitInput(body.populationLimit !== undefined ? String(body.populationLimit) : "");
    } catch (err: unknown) {
      setHostConfigError(err instanceof Error ? err.message : "Failed to load host config");
    } finally {
      setHostConfigLoading(false);
    }
  }, []);

  const savePopulationLimit = async (limit: number | null) => {
    setLimitSaving(true);
    setLimitSaveError(null);
    try {
      const res = await fetch("/admin/api/host/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ populationLimit: limit }),
      });
      const body = (await res.json()) as HostConfig & { error?: string };
      if (!res.ok) {
        throw new Error(typeof body.error === "string" ? body.error : "Failed to save limit");
      }
      setHostConfig(body);
      setLimitInput(body.populationLimit !== undefined ? String(body.populationLimit) : "");
    } catch (err: unknown) {
      setLimitSaveError(err instanceof Error ? err.message : "Failed to save limit");
    } finally {
      setLimitSaving(false);
    }
  };

  const loadInvites = useCallback(async () => {
    setInvitesLoading(true);
    setInvitesError(null);
    try {
      const res = await fetch("/admin/api/invites");
      const body = (await res.json()) as {
        invites?: AdminInviteRow[];
        configured?: boolean;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(typeof body.error === "string" ? body.error : "Failed to load invites");
      }
      setInvites(body.invites ?? []);
      setInvitesConfigured(body.configured === true);
    } catch (err: unknown) {
      setInvitesError(err instanceof Error ? err.message : "Failed to load invites");
    } finally {
      setInvitesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHostConfig();
    void loadInvites();
  }, [loadHostConfig, loadInvites]);

  const mintInvite = async () => {
    setMintLoading(true);
    setMintError(null);
    setMintedToken(null);
    try {
      const res = await fetch("/admin/api/invites/mint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 1 }),
      });
      const body = (await res.json()) as { tokens?: string[]; error?: string };
      if (!res.ok || body.tokens === undefined || body.tokens.length === 0) {
        throw new Error(typeof body.error === "string" ? body.error : "Mint failed");
      }
      setMintedToken(body.tokens[0] ?? null);
      await loadInvites();
    } catch (err: unknown) {
      setMintError(err instanceof Error ? err.message : "Mint failed");
    } finally {
      setMintLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Operations</h1>
        <p className="text-sm text-muted-foreground">Invites and principal teardown queue</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Population</CardTitle>
          <CardDescription>
            Registered principals on this host. Limit is published on{" "}
            <code className="text-xs">/.well-known/khora</code> and enforced at registration.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {hostConfigLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : hostConfigError !== null ? (
            <p className="text-sm text-destructive">{hostConfigError}</p>
          ) : hostConfig !== null ? (
            <>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Registered</dt>
                  <dd className="font-mono">{hostConfig.populationCurrent}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Limit</dt>
                  <dd className="font-mono">
                    {hostConfig.populationLimit !== undefined
                      ? hostConfig.populationLimit
                      : "Unlimited"}
                  </dd>
                </div>
              </dl>
              <div className="flex max-w-xs flex-col gap-2">
                <Label htmlFor="population-limit">Population limit</Label>
                <Input
                  id="population-limit"
                  type="number"
                  min={1}
                  placeholder="Unlimited"
                  value={limitInput}
                  onChange={(e) => setLimitInput(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={limitSaving}
                  onClick={() => {
                    const trimmed = limitInput.trim();
                    if (trimmed === "") {
                      void savePopulationLimit(null);
                      return;
                    }
                    const n = Number.parseInt(trimmed, 10);
                    if (!Number.isFinite(n) || n < 1) {
                      setLimitSaveError("Enter a positive integer or leave blank for unlimited");
                      return;
                    }
                    void savePopulationLimit(n);
                  }}
                >
                  {limitSaving ? <Loader className="size-4 animate-spin" /> : "Save limit"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={limitSaving}
                  onClick={() => void savePopulationLimit(null)}
                >
                  Clear limit
                </Button>
              </div>
              {limitSaveError !== null ? (
                <p className="text-sm text-destructive">{limitSaveError}</p>
              ) : null}
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invite tokens</CardTitle>
          <CardDescription>
            Mint tokens for manual delivery; track which agent DID claimed each token.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" disabled={mintLoading} onClick={() => void mintInvite()}>
              {mintLoading ? <Loader className="size-4 animate-spin" /> : "Mint invite token"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={invitesLoading}
              onClick={() => void loadInvites()}
            >
              Refresh
            </Button>
          </div>
          {mintError !== null ? <p className="text-sm text-destructive">{mintError}</p> : null}
          {mintedToken !== null ? (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p className="font-medium">New invite token (copy now — shown once)</p>
              <code className="mt-2 block break-all font-mono text-xs">{mintedToken}</code>
            </div>
          ) : null}
          {invitesConfigured === false ? (
            <p className="text-sm text-muted-foreground">
              Invite minting is not configured on this host.
            </p>
          ) : null}
          {invitesError !== null ? (
            <p className="text-sm text-destructive">{invitesError}</p>
          ) : null}
          {invitesLoading ? (
            <p className="text-sm text-muted-foreground">Loading invites…</p>
          ) : invites.length === 0 ? (
            <p className="text-sm text-muted-foreground">No admin-minted invites yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Preview</th>
                    <th className="py-2 pr-4 font-medium">Created</th>
                    <th className="py-2 pr-4 font-medium">Consumed</th>
                    <th className="py-2 font-medium">Claimed by</th>
                  </tr>
                </thead>
                <tbody>
                  {invites.map((invite) => (
                    <tr key={`${invite.preview}-${invite.createdAtMs}`} className="border-b">
                      <td className="py-2 pr-4 font-mono">{invite.preview}</td>
                      <td className="py-2 pr-4">{formatWhen(invite.createdAtMs)}</td>
                      <td className="py-2 pr-4">{invite.consumed ? "Yes" : "No"}</td>
                      <td className="py-2 font-mono text-xs">{invite.consumedByDid ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Operations</CardTitle>
          <CardDescription>Invite inventory and teardown worker state</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AdminStats.Operations className="space-y-4">
            <AdminStats.InvitesMetrics className="grid gap-2 text-sm [&_dt]:text-muted-foreground [&_dd]:font-mono" />
            <AdminStats.TeardownMetrics className="grid gap-2 text-sm [&_dt]:text-muted-foreground [&_dd]:font-mono" />
          </AdminStats.Operations>
        </CardContent>
      </Card>
    </div>
  );
}
