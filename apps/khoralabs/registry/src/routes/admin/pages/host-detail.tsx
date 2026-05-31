import type { RegistryHostSummaryItem } from "@khoralabs/users";
import { registrationRequirementsWithoutHealth } from "@khoralabs/users";
import { useUsersStats } from "@khoralabs/users-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { RegistrationRequirementState } from "../admin-types.ts";
import { HostHealthCard } from "../components/host-health-card.tsx";
import { HostRegistryRow } from "../components/host-registry-row.tsx";
import { PendingHostActivation } from "../components/pending-host-activation.tsx";
import { RegistrationRequirementsList } from "../components/registration-requirements.tsx";
import { parseHostDetailSlug } from "../nav.ts";
import { navigateAdmin, usePathname } from "../use-pathname.ts";

export function HostDetailPage() {
  const pathname = usePathname();
  const slug = parseHostDetailSlug(pathname);
  const { summary, summaryLoading, summaryError } = useUsersStats();

  if (slug === null) {
    return null;
  }

  if (summaryLoading) {
    return <p className="text-sm text-muted-foreground">Loading host…</p>;
  }
  if (summaryError !== null) {
    return <p className="text-sm text-destructive">{summaryError}</p>;
  }

  const host = (summary?.hosts.items ?? []).find((item) => item.slug === slug) as
    | RegistryHostSummaryItem
    | undefined;

  if (host === undefined) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          className="text-sm text-muted-foreground hover:text-foreground"
          onClick={() => navigateAdmin("/admin/hosts")}
        >
          ← All hosts
        </button>
        <p className="text-sm text-destructive">Host not found: {slug}</p>
      </div>
    );
  }

  const policyRequirements = registrationRequirementsWithoutHealth(
    host.registrationRequirements as RegistrationRequirementState[],
  );

  return (
    <div className="space-y-6">
      <button
        type="button"
        className="text-sm text-muted-foreground hover:text-foreground"
        onClick={() => navigateAdmin("/admin/hosts")}
      >
        ← All hosts
      </button>

      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-2xl font-semibold tracking-tight">{host.slug}</h1>
          <Badge variant={host.status === "active" ? "default" : "secondary"}>{host.status}</Badge>
        </div>
        <p className="font-mono text-sm text-muted-foreground">{host.baseUrl}</p>
        {host.displayName !== null ? (
          <p className="text-sm text-muted-foreground">{host.displayName}</p>
        ) : null}
      </div>

      <HostHealthCard host={host} />

      <PendingHostActivation host={host} />

      {policyRequirements.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Registration requirements</CardTitle>
            <CardDescription>Operator and billing checklist (health is above)</CardDescription>
          </CardHeader>
          <CardContent>
            <RegistrationRequirementsList requirements={policyRequirements} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Registry participation</CardTitle>
          <CardDescription>
            Trusted browser origins for CORS and auth when participation is enabled. Hosts request
            origins; operators approve them here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HostRegistryRow host={host} />
        </CardContent>
      </Card>
    </div>
  );
}
