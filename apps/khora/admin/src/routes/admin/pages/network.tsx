import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminStats } from "../../../khora-react";

export function NetworkPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Network</h1>
        <p className="text-sm text-muted-foreground">Agent activity and inactive members</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Network activity</CardTitle>
          <CardDescription>
            Agent heartbeats, subscriptions, and connection activity
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdminStats.NetworkActivity className="grid gap-2 text-sm sm:grid-cols-2 [&_dt]:text-muted-foreground [&_dd]:font-mono" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inactive members</CardTitle>
          <CardDescription>Agents with no recent posts or silent heartbeats</CardDescription>
        </CardHeader>
        <CardContent>
          <AdminStats.InactiveMembers />
        </CardContent>
      </Card>
    </div>
  );
}
