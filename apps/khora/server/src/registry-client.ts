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
  quota: { used: number; included: number };
  serverOrigin: string;
  trustBaseUrlOriginConfigured: boolean;
};

export type HostRegistryUpdateBody = {
  participationEnabled?: boolean;
  origins?: string[];
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
  const quota = json.trustedOriginQuota as { used?: number; included?: number } | undefined;
  return {
    slug: String(json.slug ?? config.slug ?? ""),
    status: String(json.status ?? "unknown"),
    participationEnabled: json.registryParticipationEnabled === true,
    origins: Array.isArray(json.trustedOrigins)
      ? json.trustedOrigins.filter((item): item is string => typeof item === "string")
      : [],
    quota: {
      used: quota?.used ?? 0,
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

export async function updateHostRegistryState(
  config: RegistryConfigSource,
  body: HostRegistryUpdateBody,
  fetchImpl: typeof fetch = fetch,
): Promise<HostRegistryRemoteState> {
  const slug = slugOrThrow(config);
  const token = managementTokenOrThrow(config);
  const origins =
    body.origins !== undefined ? mergeRegistryOrigins(config, body.origins) : undefined;
  const res = await fetchImpl(
    `${config.registryUrl.replace(/\/$/, "")}/v1/hosts/${slug}/registry`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...(body.participationEnabled !== undefined
          ? { participationEnabled: body.participationEnabled }
          : {}),
        ...(origins !== undefined ? { origins } : {}),
      }),
    },
  );
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(
      typeof json.error === "string" ? json.error : `Registry update failed (${res.status})`,
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
  const merged = mergeRegistryOrigins(config, state.origins);
  const unchanged =
    merged.length === state.origins.length &&
    merged.every((origin) => state.origins.includes(origin));
  if (unchanged) {
    return;
  }
  await updateHostRegistryState(config, { origins: state.origins }, fetchImpl);
}
