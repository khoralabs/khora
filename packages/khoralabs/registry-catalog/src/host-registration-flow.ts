import type { Database } from "bun:sqlite";
import type {
  HostHealthProbedEndpoint,
  HostHealthStatus,
  KhoraHost,
} from "@khoralabs/registry-catalog-contracts";
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
  db: Database,
  hostId: string,
  probe: HostHealthProbeFn,
): Promise<{ host: KhoraHost; requirements: RegistrationRequirementState[] }> {
  const host = findHostById(db, hostId);
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
    const updated = recordHostHealthProbe(db, hostId, result);
    return { host: updated, requirements: updated.registrationRequirements };
  } catch (err: unknown) {
    const updated = recordHostHealthProbe(
      db,
      hostId,
      { status: "down", latencyMs: null, probedEndpoint: null } satisfies HostHealthProbeResult,
      { errorDetail: err instanceof Error ? err.message : "Health probe error" },
    );
    return { host: updated, requirements: updated.registrationRequirements };
  }
}

export async function tryAutoActivateHost(
  db: Database,
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
      evaluated.host.status === "active" ? deliverPendingManagementToken(db, hostId) : null;
    return {
      host: findHostById(db, hostId) ?? evaluated.host,
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

  const { host, managementToken } = activateKhoraHost(db, hostId);
  const refreshed = findHostById(db, hostId);
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
): Record<string, unknown> {
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
