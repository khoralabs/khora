import type { HostRegistryState, KhoraHost } from "@khoralabs/registry-catalog";
import { readHostRegistryState } from "@khoralabs/registry-catalog";
import type { RegistryDatabase } from "@khoralabs/registry-persistence";

export function hostHealthJson(host: KhoraHost): Record<string, unknown> {
  return {
    status: host.healthStatus,
    readyPath: host.healthReadyPath,
    healthPath: host.healthPath,
    checkedAtMs: host.healthCheckedAtMs,
    latencyMs: host.healthLatencyMs,
    probedEndpoint: host.healthProbedEndpoint,
  };
}

export function hostRegistryJson(
  _host: KhoraHost,
  state: HostRegistryState,
): Record<string, unknown> {
  return {
    registryParticipationEnabled: state.participationEnabled,
    trustedOrigins: state.origins,
    pendingOriginRequests: state.pendingOriginRequests,
    pendingQuotaRequest: state.pendingQuotaRequest,
    trustedOriginQuota: state.quota,
  };
}

export function hostToPublicJson(host: KhoraHost): Record<string, unknown> {
  return {
    id: host.id,
    slug: host.slug,
    baseUrl: host.baseUrl,
    ...(host.displayName !== null ? { displayName: host.displayName } : {}),
    ...(host.description !== null ? { description: host.description } : {}),
    ...(host.capabilities !== null ? { capabilities: host.capabilities } : {}),
    optedInAtMs: host.optedInAtMs,
    health: hostHealthJson(host),
  };
}

export async function hostToFullJson(
  host: KhoraHost,
  db: RegistryDatabase,
): Promise<Record<string, unknown>> {
  const state = await readHostRegistryState(db, host.id);
  return {
    ...hostToPublicJson(host),
    status: host.status,
    registrationRequirements: host.registrationRequirements,
    registryParticipationEnabled: host.registryParticipationEnabled,
    includedTrustedOrigins: host.includedTrustedOrigins,
    trustedOrigins: state?.origins ?? [],
    trustedOriginQuota: state?.quota ?? {
      used: 0,
      pending: 0,
      included: host.includedTrustedOrigins,
    },
    pendingOriginRequests: state?.pendingOriginRequests ?? [],
    pendingQuotaRequest: state?.pendingQuotaRequest ?? null,
  };
}
