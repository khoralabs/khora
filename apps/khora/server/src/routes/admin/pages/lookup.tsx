import { AdminStats, useAdminStats } from "@khoralabs/khora-react";
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
    </div>
  );
}
