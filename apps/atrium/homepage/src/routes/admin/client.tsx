import { authClient } from "@khoralabs/atrium-console-auth/client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { renderRoute } from "../../render-route";
import "../../../styles/globals.css";

type Summary = {
  registeredUsers: number;
  invites: {
    configured: boolean;
    total: number;
    consumed: number;
    unconsumed: number;
  };
  teardown: {
    pending: number;
    running: number;
    active: number;
    completed: number;
    failed: number;
  };
};

type Principal = {
  did: string;
  username: string | null;
  outboxCount: number;
  subscriptionCount: number;
  cellId: string;
};

async function readJsonError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: unknown };
    if (typeof j.error === "string" && j.error.length > 0) return j.error;
  } catch {
    /* ignore */
  }
  return res.statusText || `HTTP ${res.status}`;
}

function AdminPage() {
  const { data: session, isPending } = authClient.useSession();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [did, setDid] = useState("");
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [principalError, setPrincipalError] = useState<string | null>(null);
  const [principalLoading, setPrincipalLoading] = useState(false);

  useEffect(() => {
    if (isPending) return;
    if (session === null) {
      const next = encodeURIComponent("/admin");
      window.location.href = `/login?next=${next}`;
    }
  }, [session, isPending]);

  useEffect(() => {
    if (isPending || session === null) return;
    let cancelled = false;
    (async () => {
      setSummaryLoading(true);
      setSummaryError(null);
      try {
        const res = await fetch("/api/admin/stats/summary");
        if (!res.ok) {
          throw new Error(await readJsonError(res));
        }
        const data = (await res.json()) as Summary;
        if (!cancelled) setSummary(data);
      } catch (err) {
        if (!cancelled) {
          setSummary(null);
          setSummaryError(err instanceof Error ? err.message : "Failed to load summary");
        }
      } finally {
        if (!cancelled) setSummaryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, isPending]);

  const lookupPrincipal = useCallback(async () => {
    const trimmed = did.trim();
    if (trimmed.length === 0) {
      setPrincipalError("Enter a DID");
      setPrincipal(null);
      return;
    }
    setPrincipalLoading(true);
    setPrincipalError(null);
    setPrincipal(null);
    try {
      const res = await fetch(
        `/api/admin/stats/principal?did=${encodeURIComponent(trimmed)}`,
      );
      if (!res.ok) {
        throw new Error(await readJsonError(res));
      }
      setPrincipal((await res.json()) as Principal);
    } catch (err) {
      setPrincipalError(
        err instanceof Error ? err.message : "Failed to load principal",
      );
    } finally {
      setPrincipalLoading(false);
    }
  }, [did]);

  return (
    <main className="mx-auto min-h-dvh max-w-2xl space-y-6 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Atrium Admin</h1>
          <p className="text-sm text-muted-foreground">
            {session?.user.email ?? (isPending ? "Loading session…" : "")}
          </p>
        </div>
        {session !== null && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={async () => {
              await authClient.signOut();
              window.location.href = "/login";
            }}
          >
            Sign out
          </Button>
        )}
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
          <CardDescription>Catalog and queue overview</CardDescription>
        </CardHeader>
        <CardContent>
          {summaryLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {summaryError !== null && (
            <p className="text-sm text-destructive">{summaryError}</p>
          )}
          {summary !== null && (
            <dl className="grid gap-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Registered users</dt>
                <dd className="font-mono">{summary.registeredUsers}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Invites (total)</dt>
                <dd className="font-mono">
                  {summary.invites.configured ? summary.invites.total : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Invites consumed</dt>
                <dd className="font-mono">
                  {summary.invites.configured ? summary.invites.consumed : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Invites unconsumed</dt>
                <dd className="font-mono">
                  {summary.invites.configured ? summary.invites.unconsumed : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Teardown pending</dt>
                <dd className="font-mono">{summary.teardown.pending}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Teardown running</dt>
                <dd className="font-mono">{summary.teardown.running}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Teardown active</dt>
                <dd className="font-mono">{summary.teardown.active}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Teardown completed</dt>
                <dd className="font-mono">{summary.teardown.completed}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Teardown failed</dt>
                <dd className="font-mono">{summary.teardown.failed}</dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Principal lookup</CardTitle>
          <CardDescription>Stats for a registered DID</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="did">DID</Label>
            <div className="flex gap-2">
              <Input
                id="did"
                value={did}
                onChange={(e) => setDid(e.target.value)}
                placeholder="did:…"
                className="font-mono text-sm"
              />
              <Button type="button" onClick={lookupPrincipal} disabled={principalLoading}>
                {principalLoading ? "…" : "Look up"}
              </Button>
            </div>
          </div>
          {principalError !== null && (
            <p className="text-sm text-destructive">{principalError}</p>
          )}
          {principal !== null && (
            <dl className="grid gap-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Username</dt>
                <dd className="font-mono">{principal.username ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Outbox count</dt>
                <dd className="font-mono">{principal.outboxCount}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Subscriptions</dt>
                <dd className="font-mono">{principal.subscriptionCount}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Cell</dt>
                <dd className="font-mono text-xs">{principal.cellId}</dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

renderRoute(AdminPage);
