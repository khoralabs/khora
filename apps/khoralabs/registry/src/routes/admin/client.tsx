import { UsersStats, useUsersStats } from "@khoralabs/users-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { renderRoute } from "../../render-route";
import "../../../styles/globals.css";
import { HostRegistryParticipation } from "./host-registry-participation";
import { PendingHostActivations } from "./pending-host-activations";

function EmailLookupForm() {
  const { lookupEmail, setLookupEmail, runEmailLookup, emailLookupLoading } = useUsersStats();

  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void runEmailLookup();
      }}
    >
      <div className="min-w-0 flex-1 space-y-2">
        <Label htmlFor="users-lookup-email" className="sr-only">
          Email
        </Label>
        <Input
          id="users-lookup-email"
          name="email"
          type="email"
          value={lookupEmail}
          onChange={(e) => setLookupEmail(e.target.value)}
          placeholder="user@example.com"
          disabled={emailLookupLoading}
        />
      </div>
      <Button type="submit" disabled={emailLookupLoading}>
        {emailLookupLoading ? "…" : "Look up"}
      </Button>
    </form>
  );
}

function AdminPage() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/admin/api/session");
        setAuthenticated(res.ok);
        if (!res.ok) {
          window.location.href = "/admin/login";
        }
      } catch {
        setAuthenticated(false);
        window.location.href = "/admin/login";
      }
    })();
  }, []);

  if (authenticated !== true) {
    return (
      <main className="mx-auto min-h-dvh max-w-2xl p-6">
        <p className="text-sm text-muted-foreground">Loading session…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-dvh max-w-2xl space-y-6 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Registry Admin</h1>
          <p className="text-sm text-muted-foreground">Network user data</p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            await fetch("/admin/api/logout", { method: "POST" });
            window.location.href = "/admin/login";
          }}
        >
          Sign out
        </Button>
      </header>

      <UsersStats.Root
        baseUrl="/admin/api/stats"
        lookupBaseUrl="/admin/api/lookup"
        className="space-y-6"
      >
        <Card>
          <CardHeader>
            <CardTitle>Network overview</CardTitle>
            <CardDescription>Accounts, access requests, and marketing consents</CardDescription>
          </CardHeader>
          <CardContent>
            <UsersStats.Overview className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <h3 className="text-sm font-medium">Accounts</h3>
                  <UsersStats.AccountsMetrics className="grid gap-2 text-sm [&_dt]:text-muted-foreground [&_dd]:font-mono" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-medium">Access requests</h3>
                  <UsersStats.AccessRequestsMetrics className="grid gap-2 text-sm [&_dt]:text-muted-foreground [&_dd]:font-mono" />
                </div>
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-medium">Marketing & memberships</h3>
                <UsersStats.MarketingMetrics className="grid gap-2 text-sm [&_dt]:text-muted-foreground [&_dd]:font-mono" />
              </div>
            </UsersStats.Overview>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hosts</CardTitle>
            <CardDescription>Federated Khora hosts registered in the network</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <PendingHostActivations />
            <HostRegistryParticipation />
            <UsersStats.HostList className="space-y-2 [&_[data-slot=users-stats-host-list-item]]:rounded-md [&_[data-slot=users-stats-host-list-item]]:border [&_[data-slot=users-stats-host-list-item]]:p-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Email lookup</CardTitle>
            <CardDescription>Account, access requests, and consents for an email</CardDescription>
          </CardHeader>
          <CardContent>
            <UsersStats.EmailLookup className="space-y-4">
              <EmailLookupForm />
              <UsersStats.EmailLookupResult className="rounded-lg border p-4 text-sm" />
            </UsersStats.EmailLookup>
          </CardContent>
        </Card>
      </UsersStats.Root>
    </main>
  );
}

renderRoute(AdminPage);
