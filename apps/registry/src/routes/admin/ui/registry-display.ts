import type {
  HostHealthProbedEndpoint,
  HostHealthStatus,
  RegistrationRequirementState,
} from "@khoralabs/registry/contracts";

/** Subset of probe result used by admin UI copy (no server / DB fields). */
export type HostHealthProbeDisplay = {
  status: HostHealthStatus;
  probedEndpoint?: HostHealthProbedEndpoint | null;
};

export function healthCheckRequirementDetail(result: HostHealthProbeDisplay): string {
  if (result.status === "up") {
    return `Health probe OK (${result.probedEndpoint ?? "unknown"})`;
  }
  return "Health probe failed";
}

/** Registration checklist items other than health (health uses host health columns). */
export function registrationRequirementsWithoutHealth(
  requirements: RegistrationRequirementState[],
): RegistrationRequirementState[] {
  return requirements.filter((item) => item.id !== "health_check");
}
