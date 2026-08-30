import type {
  HostTrustedOriginQuotaRequest,
  HostTrustedOriginQuotaRequestStatus,
  HostTrustedOriginRequest,
  HostTrustedOriginRequestStatus,
  RegistrationRequirementState,
} from "@khoralabs/khora-registry/contracts";

import { type RegistryClientConfig, readServerPublicOrigin } from "./config";
import type { HostRegistrationClientState, HostRegistryClientState } from "./types";

function asOriginRequestStatus(raw: unknown): HostTrustedOriginRequestStatus {
  if (raw === "approved" || raw === "rejected" || raw === "pending") {
    return raw;
  }
  return "pending";
}

function asQuotaRequestStatus(raw: unknown): HostTrustedOriginQuotaRequestStatus {
  if (raw === "approved" || raw === "rejected" || raw === "pending") {
    return raw;
  }
  return "pending";
}

function mapOriginRequest(item: Record<string, unknown>): HostTrustedOriginRequest {
  return {
    id: String(item.id ?? ""),
    hostId: String(item.hostId ?? ""),
    origin: String(item.origin ?? ""),
    status: asOriginRequestStatus(item.status),
    requestedAtMs: Number(item.requestedAtMs ?? 0),
    reviewedAtMs:
      item.reviewedAtMs === null || item.reviewedAtMs === undefined
        ? null
        : Number(item.reviewedAtMs),
  };
}

function mapQuotaRequest(item: Record<string, unknown>): HostTrustedOriginQuotaRequest {
  return {
    id: String(item.id ?? ""),
    hostId: String(item.hostId ?? ""),
    requestedIncluded: Number(item.requestedIncluded ?? 0),
    status: asQuotaRequestStatus(item.status),
    requestedAtMs: Number(item.requestedAtMs ?? 0),
    reviewedAtMs:
      item.reviewedAtMs === null || item.reviewedAtMs === undefined
        ? null
        : Number(item.reviewedAtMs),
  };
}

export function mapRegistryResponse(
  json: Record<string, unknown>,
  config: RegistryClientConfig,
): HostRegistryClientState {
  const quota = json.trustedOriginQuota as
    | { used?: number; pending?: number; included?: number }
    | undefined;
  const pendingRaw = json.pendingOriginRequests;
  const pendingOriginRequests = Array.isArray(pendingRaw)
    ? pendingRaw
        .filter(
          (item): item is Record<string, unknown> => typeof item === "object" && item !== null,
        )
        .map(mapOriginRequest)
    : [];
  const quotaRaw = json.pendingQuotaRequest;
  const pendingQuotaRequest =
    typeof quotaRaw === "object" && quotaRaw !== null
      ? mapQuotaRequest(quotaRaw as Record<string, unknown>)
      : null;
  return {
    slug: String(json.slug ?? config.slug ?? ""),
    status: String(json.status ?? "unknown"),
    participationEnabled: json.registryParticipationEnabled === true,
    origins: Array.isArray(json.trustedOrigins)
      ? json.trustedOrigins.filter((item): item is string => typeof item === "string")
      : [],
    pendingOriginRequests,
    pendingQuotaRequest,
    quota: {
      used: quota?.used ?? 0,
      pending: quota?.pending ?? 0,
      included: quota?.included ?? 0,
    },
    serverOrigin: readServerPublicOrigin(config),
    trustBaseUrlOriginConfigured: config.trustBaseUrlOrigin === true,
  };
}

export function mapRegistrationResponse(
  json: Record<string, unknown>,
  config: RegistryClientConfig,
): HostRegistrationClientState {
  const quota = (json.host as Record<string, unknown> | undefined)?.trustedOriginQuota as
    | { used?: number; included?: number }
    | undefined;
  const trustedOrigins = (json.host as Record<string, unknown> | undefined)?.trustedOrigins;
  return {
    status: String(json.status ?? "unknown"),
    trustLevel: typeof json.trustLevel === "string" ? json.trustLevel : undefined,
    requirements: Array.isArray(json.requirements)
      ? (json.requirements as RegistrationRequirementState[])
      : undefined,
    activated: json.activated === true,
    registrationSecret:
      typeof json.registrationSecret === "string" ? json.registrationSecret : undefined,
    managementToken: typeof json.managementToken === "string" ? json.managementToken : undefined,
    message: typeof json.message === "string" ? json.message : undefined,
    slug: typeof json.slug === "string" ? json.slug : config.slug,
    participationEnabled:
      (json.host as Record<string, unknown> | undefined)?.registryParticipationEnabled === true,
    origins: Array.isArray(trustedOrigins)
      ? trustedOrigins.filter((item): item is string => typeof item === "string")
      : undefined,
    quota:
      quota !== undefined ? { used: quota.used ?? 0, included: quota.included ?? 0 } : undefined,
    serverOrigin: readServerPublicOrigin(config),
    trustBaseUrlOriginConfigured: config.trustBaseUrlOrigin === true,
  };
}

export async function parseJsonBody(
  res: Response,
): Promise<Record<string, unknown> & { error?: string }> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
}
