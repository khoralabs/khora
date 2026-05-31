import type { RegistryHostSummaryItem } from "@khoralabs/users";
import { registrationRequirementsWithoutHealth } from "@khoralabs/users";
import { useUsersStats } from "@khoralabs/users-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { RegistrationRequirementState } from "../admin-types.ts";
import { RegistrationRequirementsList } from "./registration-requirements.tsx";

type ActivateResult = {
  managementToken?: string;
};

export function PendingHostActivation({ host }: { host: RegistryHostSummaryItem }) {
  const { refetchSummary } = useUsersStats();
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [managementToken, setManagementToken] = useState<string | null>(null);

  if (host.status !== "pending") {
    return null;
  }

  const requirements = registrationRequirementsWithoutHealth(
    host.registrationRequirements as RegistrationRequirementState[],
  );

  return (
    <div className="space-y-3 rounded-lg border p-4" data-slot="pending-host-activation">
      <div>
        <h2 className="text-sm font-medium">Activation</h2>
        <p className="text-sm text-muted-foreground">
          Approve this host to issue a management token and include it in the public catalog.
        </p>
      </div>
      {requirements.length > 0 ? (
        <RegistrationRequirementsList requirements={requirements} />
      ) : null}
      {error !== null ? <p className="text-sm text-destructive">{error}</p> : null}
      {managementToken !== null ? (
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <p className="font-medium">Management token (copy now — shown once)</p>
          <p className="mt-1 break-all font-mono text-xs">{managementToken}</p>
        </div>
      ) : null}
      <Button
        type="button"
        size="sm"
        disabled={activating}
        onClick={async () => {
          setError(null);
          setActivating(true);
          try {
            const res = await fetch(`/admin/api/hosts/${host.id}/activate`, { method: "POST" });
            const json = (await res.json().catch(() => ({}))) as ActivateResult & {
              error?: string;
            };
            if (!res.ok) {
              throw new Error(json.error ?? `Activate failed (${res.status})`);
            }
            if (typeof json.managementToken === "string") {
              setManagementToken(json.managementToken);
            }
            await refetchSummary();
          } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Activate failed");
          } finally {
            setActivating(false);
          }
        }}
      >
        {activating ? "Activating…" : "Activate host"}
      </Button>
    </div>
  );
}
