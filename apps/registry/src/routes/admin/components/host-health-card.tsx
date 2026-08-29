import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { healthCheckRequirementDetail, type RegistryHostSummaryItem } from "@/routes/admin/ui";

function formatCheckedAt(ms: number | null): string | null {
  if (ms === null) {
    return null;
  }
  return new Date(ms).toLocaleString();
}

export function HostHealthCard({ host }: { host: RegistryHostSummaryItem }) {
  const healthReq = host.registrationRequirements.find((item) => item.id === "health_check");
  const detail =
    healthReq?.detail ??
    (host.healthStatus === "up"
      ? healthCheckRequirementDetail({
          status: "up",
          probedEndpoint: host.healthProbedEndpoint,
        })
      : host.healthStatus === "down"
        ? "Health probe failed"
        : "Not probed yet");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Health</CardTitle>
        <CardDescription>
          Registry probes GET {host.healthReadyPath} then {host.healthPath} on the host base URL
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <span className="text-muted-foreground">Status: </span>
          <span className="font-mono">{host.healthStatus}</span>
        </div>
        {host.healthLatencyMs !== null ? (
          <div>
            <span className="text-muted-foreground">Latency: </span>
            <span className="font-mono">{host.healthLatencyMs}ms</span>
          </div>
        ) : null}
        {host.healthProbedEndpoint !== null ? (
          <div>
            <span className="text-muted-foreground">Probed: </span>
            <span className="font-mono">{host.healthProbedEndpoint}</span>
          </div>
        ) : null}
        {formatCheckedAt(host.healthCheckedAtMs) !== null ? (
          <div className="sm:col-span-2">
            <span className="text-muted-foreground">Last checked: </span>
            <span className="font-mono">{formatCheckedAt(host.healthCheckedAtMs)}</span>
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <span className="text-muted-foreground">Detail: </span>
          <span>{detail}</span>
        </div>
      </CardContent>
    </Card>
  );
}
