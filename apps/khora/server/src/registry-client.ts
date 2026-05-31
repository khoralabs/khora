import { envRegistryTrustBaseUrlOrigin } from "./env";
import type { RegistrationRequirementState } from "./registry-types";

export type RegistryConfigSource = {
  registryUrl: string;
  slug: string | undefined;
  publicBaseUrl: string;
  displayName?: string;
  registrationSecret?: string;
  managementToken?: string;
};

export type HostRegistryRemoteState = {
  slug: string;
  status: string;
  participationEnabled: boolean;
  origins: string[];
  pendingOriginRequests: HostTrustedOriginRequestRemote[];
  pendingQuotaRequest: HostTrustedOriginQuotaRequestRemote | null;
  quota: { used: number; pending: number; included: number };
  serverOrigin: string;
  trustBaseUrlOriginConfigured: boolean;
};

export type HostTrustedOriginRequestRemote = {
  id: string;
  hostId: string;
  origin: string;
  status: string;
  requestedAtMs: number;
  reviewedAtMs: number | null;
};

export type HostTrustedOriginQuotaRequestRemote = {
  id: string;
  hostId: string;
  requestedIncluded: number;
  status: string;
  requestedAtMs: number;
  reviewedAtMs: number | null;
};

export type HostRegistryUpdateBody = {
  origin?: string;
  requestId?: string;
};

export type HostRegistrationRemoteState = {
  status: string;
  trustLevel?: string;
  requirements?: RegistrationRequirementState[];
  activated?: boolean;
  registrationSecret?: string;
  managementToken?: string;
  message?: string;
  slug?: string;
  participationEnabled?: boolean;
  origins?: string[];
  quota?: { used: number; included: number };
  serverOrigin?: string;
  trustBaseUrlOriginConfigured?: boolean;
};

function slugOrThrow(config: RegistryConfigSource): string {
  if (config.slug === undefined) {
    throw new Error("Host slug is not configured");
  }
  return config.slug;
}

function managementTokenOrThrow(config: RegistryConfigSource): string {
  if (config.managementToken === undefined) {
    throw new Error("Management token is not configured");
  }
  return config.managementToken;
}

export function readServerPublicOrigin(config: RegistryConfigSource): string {
  return new URL(config.publicBaseUrl).origin;
}

export function mergeRegistryOrigins(config: RegistryConfigSource, origins: string[]): string[] {
  const merged = [...origins];
  if (envRegistryTrustBaseUrlOrigin()) {
    merged.push(readServerPublicOrigin(config));
  }
  return [...new Set(merged.map((origin) => origin.trim()).filter((origin) => origin.length > 0))];
}

function mapRegistryResponse(
  json: Record<string, unknown>,
  config: RegistryConfigSource,
): HostRegistryRemoteState {
  const quota = json.trustedOriginQuota as
    | { used?: number; pending?: number; included?: number }
    | undefined;
  const pendingRaw = json.pendingOriginRequests;
  const pendingOriginRequests = Array.isArray(pendingRaw)
    ? pendingRaw
        .filter(
          (item): item is Record<string, unknown> => typeof item === "object" && item !== null,
        )
        .map(
          (item): HostTrustedOriginRequestRemote => ({
            id: String(item.id ?? ""),
            hostId: String(item.hostId ?? ""),
            origin: String(item.origin ?? ""),
            status: String(item.status ?? "pending"),
            requestedAtMs: Number(item.requestedAtMs ?? 0),
            reviewedAtMs:
              item.reviewedAtMs === null || item.reviewedAtMs === undefined
                ? null
                : Number(item.reviewedAtMs),
          }),
        )
    : [];
  const quotaRaw = json.pendingQuotaRequest;
  const pendingQuotaRequest =
    typeof quotaRaw === "object" && quotaRaw !== null
      ? {
          id: String((quotaRaw as Record<string, unknown>).id ?? ""),
          hostId: String((quotaRaw as Record<string, unknown>).hostId ?? ""),
          requestedIncluded: Number((quotaRaw as Record<string, unknown>).requestedIncluded ?? 0),
          status: String((quotaRaw as Record<string, unknown>).status ?? "pending"),
          requestedAtMs: Number((quotaRaw as Record<string, unknown>).requestedAtMs ?? 0),
          reviewedAtMs:
            (quotaRaw as Record<string, unknown>).reviewedAtMs === null ||
            (quotaRaw as Record<string, unknown>).reviewedAtMs === undefined
              ? null
              : Number((quotaRaw as Record<string, unknown>).reviewedAtMs),
        }
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
    trustBaseUrlOriginConfigured: envRegistryTrustBaseUrlOrigin(),
  };
}

function mapRegistrationResponse(
  json: Record<string, unknown>,
  config: RegistryConfigSource,
): HostRegistrationRemoteState {
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
    trustBaseUrlOriginConfigured: envRegistryTrustBaseUrlOrigin(),
  };
}

export async function registerHostWithRegistryRemote(
  config: RegistryConfigSource,
  fetchImpl: typeof fetch = fetch,
): Promise<HostRegistrationRemoteState> {
  const slug = slugOrThrow(config);
  const body: Record<string, string> = {
    slug,
    baseUrl: config.publicBaseUrl,
  };
  if (config.displayName !== undefined && config.displayName.length > 0) {
    body.displayName = config.displayName;
  }

  const res = await fetchImpl(`${config.registryUrl.replace(/\/$/, "")}/v1/hosts/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(
      typeof json.error === "string" ? json.error : `Registration failed (${res.status})`,
    );
  }
  return mapRegistrationResponse(json, config);
}

export async function fetchHostRegistrationStatus(
  config: RegistryConfigSource,
  fetchImpl: typeof fetch = fetch,
): Promise<HostRegistrationRemoteState> {
  const slug = slugOrThrow(config);
  if (config.registrationSecret === undefined) {
    throw new Error("Registration secret is not configured");
  }
  const res = await fetchImpl(
    `${config.registryUrl.replace(/\/$/, "")}/v1/hosts/${slug}/registration`,
    {
      headers: { Authorization: `Bearer ${config.registrationSecret}` },
    },
  );
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(
      typeof json.error === "string" ? json.error : `Registration status failed (${res.status})`,
    );
  }
  return mapRegistrationResponse(json, config);
}

export async function claimHostRegistration(
  config: RegistryConfigSource,
  fetchImpl: typeof fetch = fetch,
): Promise<HostRegistrationRemoteState> {
  const slug = slugOrThrow(config);
  if (config.registrationSecret === undefined) {
    throw new Error("Registration secret is not configured");
  }
  const res = await fetchImpl(
    `${config.registryUrl.replace(/\/$/, "")}/v1/hosts/${slug}/registration/claim`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${config.registrationSecret}` },
    },
  );
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(typeof json.error === "string" ? json.error : `Claim failed (${res.status})`);
  }
  return mapRegistrationResponse(json, config);
}

export async function fetchHostRegistryState(
  config: RegistryConfigSource,
  fetchImpl: typeof fetch = fetch,
): Promise<HostRegistryRemoteState> {
  const slug = slugOrThrow(config);
  const token = managementTokenOrThrow(config);
  const res = await fetchImpl(
    `${config.registryUrl.replace(/\/$/, "")}/v1/hosts/${slug}/registry`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(
      typeof json.error === "string" ? json.error : `Registry read failed (${res.status})`,
    );
  }
  return mapRegistryResponse(json, config);
}

export async function requestHostTrustedOriginRemote(
  config: RegistryConfigSource,
  origin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<HostRegistryRemoteState> {
  const slug = slugOrThrow(config);
  const token = managementTokenOrThrow(config);
  const res = await fetchImpl(
    `${config.registryUrl.replace(/\/$/, "")}/v1/hosts/${slug}/registry/origin-requests`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ origin }),
    },
  );
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(
      typeof json.error === "string" ? json.error : `Origin request failed (${res.status})`,
    );
  }
  return fetchHostRegistryState(config, fetchImpl);
}

export async function cancelHostTrustedOriginRequestRemote(
  config: RegistryConfigSource,
  requestId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<HostRegistryRemoteState> {
  const slug = slugOrThrow(config);
  const token = managementTokenOrThrow(config);
  const res = await fetchImpl(
    `${config.registryUrl.replace(/\/$/, "")}/v1/hosts/${slug}/registry/origin-requests/${encodeURIComponent(requestId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(
      typeof json.error === "string" ? json.error : `Cancel origin request failed (${res.status})`,
    );
  }
  return mapRegistryResponse(json, config);
}

export async function requestHostTrustedOriginQuotaRemote(
  config: RegistryConfigSource,
  requestedIncluded: number,
  fetchImpl: typeof fetch = fetch,
): Promise<HostRegistryRemoteState> {
  const slug = slugOrThrow(config);
  const token = managementTokenOrThrow(config);
  const res = await fetchImpl(
    `${config.registryUrl.replace(/\/$/, "")}/v1/hosts/${slug}/registry/quota-requests`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requestedIncluded }),
    },
  );
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(
      typeof json.error === "string" ? json.error : `Quota request failed (${res.status})`,
    );
  }
  return fetchHostRegistryState(config, fetchImpl);
}

export async function cancelHostTrustedOriginQuotaRequestRemote(
  config: RegistryConfigSource,
  requestId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<HostRegistryRemoteState> {
  const slug = slugOrThrow(config);
  const token = managementTokenOrThrow(config);
  const res = await fetchImpl(
    `${config.registryUrl.replace(/\/$/, "")}/v1/hosts/${slug}/registry/quota-requests/${encodeURIComponent(requestId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(
      typeof json.error === "string" ? json.error : `Cancel quota request failed (${res.status})`,
    );
  }
  return mapRegistryResponse(json, config);
}

export async function removeHostTrustedOriginRemote(
  config: RegistryConfigSource,
  origin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<HostRegistryRemoteState> {
  const slug = slugOrThrow(config);
  const token = managementTokenOrThrow(config);
  const res = await fetchImpl(
    `${config.registryUrl.replace(/\/$/, "")}/v1/hosts/${slug}/registry/origins`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ origin }),
    },
  );
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(
      typeof json.error === "string" ? json.error : `Remove origin failed (${res.status})`,
    );
  }
  return mapRegistryResponse(json, config);
}

export async function syncHostRegistryOnStartup(
  config: RegistryConfigSource,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (!envRegistryTrustBaseUrlOrigin()) {
    return;
  }
  const state = await fetchHostRegistryState(config, fetchImpl);
  const serverOrigin = readServerPublicOrigin(config);
  const approved = state.origins.includes(serverOrigin);
  const pending = state.pendingOriginRequests.some(
    (request) => request.origin === serverOrigin && request.status === "pending",
  );
  if (approved || pending) {
    return;
  }
  await requestHostTrustedOriginRemote(config, serverOrigin, fetchImpl);
}
