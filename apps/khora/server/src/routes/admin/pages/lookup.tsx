import { AdminStats, useAdminStats } from "@khoralabs/khora-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function PrincipalLookupForm() {
  const { principalDid, setPrincipalDid, lookupPrincipal, principalLoading } = useAdminStats();

  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void lookupPrincipal();
      }}
    >
      <div className="min-w-0 flex-1 space-y-2">
        <Label htmlFor="admin-principal-did" className="sr-only">
          DID
        </Label>
        <Input
          id="admin-principal-did"
          name="did"
          value={principalDid}
          onChange={(e) => setPrincipalDid(e.target.value)}
          placeholder="did:…"
          className="font-mono"
          disabled={principalLoading}
        />
      </div>
      <Button type="submit" disabled={principalLoading}>
        {principalLoading ? "…" : "Look up"}
      </Button>
    </form>
  );
}

function AgentLifecycleActions() {
  const [did, setDid] = useState("");
  const [confirmDid, setConfirmDid] = useState("");
  const [busy, setBusy] = useState<"suspend" | "reactivate" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const normalizedDid = did.trim();
  const deleteConfirmed = confirmDid.trim() === normalizedDid && normalizedDid.length > 0;

  async function run(action: "suspend" | "reactivate" | "delete"): Promise<void> {
    if (normalizedDid.length === 0) {
      setError("DID is required");
      return;
    }
    setBusy(action);
    setError(null);
    setStatus(null);
    try {
      const didPath = encodeURIComponent(normalizedDid);
      const res =
        action === "delete"
          ? await fetch(`/admin/api/agents/${didPath}`, { method: "DELETE" })
          : await fetch(`/admin/api/agents/${didPath}/${action}`, { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? `${action} failed (${res.status})`);
      }
      setStatus(action === "reactivate" ? "Agent reactivated" : `Agent ${action}ed`);
      if (action === "delete") {
        setConfirmDid("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : `${action} failed`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent lifecycle</CardTitle>
        <CardDescription>Suspend, reactivate, or delete an agent DID.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="admin-agent-did">Agent DID</Label>
          <Input
            id="admin-agent-did"
            value={did}
            onChange={(e) => setDid(e.target.value)}
            placeholder="did:…"
            className="font-mono"
            disabled={busy !== null}
          />
        </div>
        {error !== null ? <p className="text-sm text-destructive">{error}</p> : null}
        {status !== null ? <p className="text-sm text-muted-foreground">{status}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy !== null || normalizedDid.length === 0}
            onClick={() => void run("suspend")}
          >
            {busy === "suspend" ? "Suspending…" : "Suspend agent"}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy !== null || normalizedDid.length === 0}
            onClick={() => void run("reactivate")}
          >
            {busy === "reactivate" ? "Reactivating…" : "Reactivate agent"}
          </Button>
        </div>
        <div className="space-y-2 rounded-md border border-destructive/30 p-3">
          <p className="text-sm font-medium text-destructive">Delete permanently</p>
          <p className="text-xs text-muted-foreground">
            Type the DID exactly to confirm deletion and unregister it from this host.
          </p>
          <Input
            value={confirmDid}
            onChange={(e) => setConfirmDid(e.target.value)}
            placeholder={normalizedDid.length > 0 ? normalizedDid : "did:..."}
            className="font-mono"
            disabled={busy !== null}
          />
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={busy !== null || !deleteConfirmed}
            onClick={() => void run("delete")}
          >
            {busy === "delete" ? "Deleting…" : "Delete permanently"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function LookupPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Principal lookup</h1>
        <p className="text-sm text-muted-foreground">Stats for a registered DID</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lookup</CardTitle>
          <CardDescription>Search by principal DID</CardDescription>
        </CardHeader>
        <CardContent>
          <AdminStats.PrincipalLookup className="space-y-4">
            <PrincipalLookupForm />
            <AdminStats.PrincipalLookupResult className="grid gap-2 text-sm [&_dt]:text-muted-foreground [&_dd]:font-mono [&_dd:last-child]:text-xs" />
          </AdminStats.PrincipalLookup>
        </CardContent>
      </Card>
      <AgentLifecycleActions />
    </div>
  );
}
