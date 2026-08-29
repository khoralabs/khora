import type {
  HostHealthProbedEndpoint,
  HostHealthStatus,
  HostRegistrationStatusWire,
  KhoraHost,
} from "@khoralabs/registry/contracts";
import type { RegistryDatabase } from "@khoralabs/registry/persistence";
import { type HostHealthProbeResult, recordHostHealthProbe } from "./host-health-probe";
import {
  allAutoActivateRequirementsMet,
  type RegistrationPolicy,
  type RegistrationRequirementState,
  readRegistrationPolicyFromEnv,
} from "./host-registration-requirements";
import { activateKhoraHost, deliverPendingManagementToken, findHostById } from "./khora-hosts";

export type HostHealthProbeFn = (host: KhoraHost) => Promise<{
  status: HostHealthStatus;
  latencyMs: number | null;
  probedEndpoint: HostHealthProbedEndpoint | null;
}>;

export function readHostRegistrationPolicy(
  env: NodeJS.ProcessEnv = process.env,
): RegistrationPolicy {
  return readRegistrationPolicyFromEnv(env);
}

export async function evaluateHostHealthRequirement(
  db: RegistryDatabase,
  hostId: string,
  probe: HostHealthProbeFn,
): Promise<{ host: KhoraHost; requirements: RegistrationRequirementState[] }> {
  const host = await findHostById(db, hostId);
  if (host === null) {
    throw new Error("host not found");
  }
  const requirements = host.registrationRequirements;
  const hasHealth = requirements.some((item) => item.id === "health_check");
  if (!hasHealth) {
    return { host, requirements };
  }

  try {
    const result = await probe(host);
    const updated = await recordHostHealthProbe(db, hostId, result);
    return { host: updated, requirements: updated.registrationRequirements };
  } catch (err: unknown) {
    const updated = await recordHostHealthProbe(
      db,
      hostId,
      { status: "down", latencyMs: null, probedEndpoint: null } satisfies HostHealthProbeResult,
      { errorDetail: err instanceof Error ? err.message : "Health probe error" },
    );
    return { host: updated, requirements: updated.registrationRequirements };
  }
}

export async function tryAutoActivateHost(
  db: RegistryDatabase,
  hostId: string,
  policy: RegistrationPolicy,
  probe: HostHealthProbeFn,
): Promise<{
  host: KhoraHost;
  requirements: RegistrationRequirementState[];
  managementToken: string | null;
  activated: boolean;
}> {
  const evaluated = await evaluateHostHealthRequirement(db, hostId, probe);
  if (evaluated.host.status !== "pending") {
    const token =
      evaluated.host.status === "active" ? await deliverPendingManagementToken(db, hostId) : null;
    return {
      host: (await findHostById(db, hostId)) ?? evaluated.host,
      requirements: evaluated.requirements,
      managementToken: token,
      activated: false,
    };
  }

  if (!allAutoActivateRequirementsMet(evaluated.requirements, policy)) {
    return {
      host: evaluated.host,
      requirements: evaluated.requirements,
      managementToken: null,
      activated: false,
    };
  }

  const { host, managementToken } = await activateKhoraHost(db, hostId);
  const refreshed = await findHostById(db, hostId);
  return {
    host: refreshed ?? host,
    requirements: refreshed?.registrationRequirements ?? [],
    managementToken,
    activated: true,
  };
}

export function registrationStatusJson(
  host: KhoraHost,
  policy: RegistrationPolicy,
): HostRegistrationStatusWire {
  return {
    slug: host.slug,
    status: host.status,
    trustLevel: policy.trustLevel,
    requirements: host.registrationRequirements,
    health: {
      status: host.healthStatus,
      checkedAtMs: host.healthCheckedAtMs,
      latencyMs: host.healthLatencyMs,
      probedEndpoint: host.healthProbedEndpoint,
    },
  };
}
