import { UsersStats, useUsersStats } from "@khoralabs/users-react/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

export function LookupPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Email lookup</h1>
        <p className="text-sm text-muted-foreground">
          Account, access requests, and consents for an email address
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lookup</CardTitle>
          <CardDescription>Search registry user records by email</CardDescription>
        </CardHeader>
        <CardContent>
          <UsersStats.EmailLookup className="space-y-4">
            <EmailLookupForm />
            <UsersStats.EmailLookupResult className="rounded-lg border p-4 text-sm" />
          </UsersStats.EmailLookup>
        </CardContent>
      </Card>
    </div>
  );
}
