import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HostRegistryCard } from "../registry-card.tsx";

export function RegistryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Registry</h1>
        <p className="text-sm text-muted-foreground">
          Register with the network registry and manage trusted browser origins
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Network registry</CardTitle>
          <CardDescription>Self-serve registration and origin configuration</CardDescription>
        </CardHeader>
        <CardContent>
          <HostRegistryCard />
        </CardContent>
      </Card>
    </div>
  );
}
