import { AdminStats } from "@khoralabs/khora-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function OperationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Operations</h1>
        <p className="text-sm text-muted-foreground">Invites and principal teardown queue</p>
      </div>

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
