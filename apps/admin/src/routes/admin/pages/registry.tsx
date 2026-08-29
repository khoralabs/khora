import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HostRegistryCard } from "../registry-card.tsx";
import { useRegistryBadge } from "../use-registry-badge.ts";

export function RegistryPage() {
  const registryBadge = useRegistryBadge();

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Registry</h1>
          {registryBadge !== undefined ? (
            <Badge variant={registryBadge.variant}>{registryBadge.label}</Badge>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          Optional network registration and trusted browser origins
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
