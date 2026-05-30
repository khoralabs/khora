import {
  envHostSlug,
  envPort,
  envPublicBaseUrl,
  envRegistryManagementToken,
  envRegistryTrustBaseUrlOrigin,
  envRegistryUrl,
} from "./env.ts";

const DEFAULT_REGISTRY_URL = "http://localhost:4000";

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

function registryBaseUrl(): string {
  return envRegistryUrl() ?? DEFAULT_REGISTRY_URL;
}

function hostSlugOrThrow(): string {
  const slug = envHostSlug();
  if (slug === undefined) {
    throw new Error("KHORA_HOST_SLUG is not configured");
  }
  return slug;
}

function managementTokenOrThrow(): string {
  const token = envRegistryManagementToken();
  if (token === undefined) {
    throw new Error("KHORA_REGISTRY_MANAGEMENT_TOKEN is not configured");
  }
  return token;
}

export function readServerPublicOrigin(): string {
  return new URL(envPublicBaseUrl(envPort())).origin;
}

export function mergeRegistryOrigins(origins: string[]): string[] {
  const merged = [...origins];
  if (envRegistryTrustBaseUrlOrigin()) {
    merged.push(readServerPublicOrigin());
  }
  return [...new Set(merged.map((origin) => origin.trim()).filter((origin) => origin.length > 0))];
}

function mapRegistryResponse(
  json: Record<string, unknown>,
): Omit<HostRegistryRemoteState, "serverOrigin" | "trustBaseUrlOriginConfigured"> {
  const quota = json.trustedOriginQuota as { used?: number; included?: number } | undefined;
  return {
    slug: String(json.slug ?? ""),
    status: String(json.status ?? "unknown"),
    participationEnabled: json.registryParticipationEnabled === true,
    origins: Array.isArray(json.trustedOrigins)
      ? json.trustedOrigins.filter((item): item is string => typeof item === "string")
      : [],
    quota: {
      used: quota?.used ?? 0,
      included: quota?.included ?? 0,
    },
  };
}

export async function fetchHostRegistryState(
  fetchImpl: typeof fetch = fetch,
): Promise<HostRegistryRemoteState> {
  const slug = hostSlugOrThrow();
  const token = managementTokenOrThrow();
  const res = await fetchImpl(`${registryBaseUrl()}/v1/hosts/${slug}/registry`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(
      typeof json.error === "string" ? json.error : `Registry read failed (${res.status})`,
    );
  }
  return {
    ...mapRegistryResponse(json),
    serverOrigin: readServerPublicOrigin(),
    trustBaseUrlOriginConfigured: envRegistryTrustBaseUrlOrigin(),
  };
}

export async function updateHostRegistryState(
  body: HostRegistryUpdateBody,
  fetchImpl: typeof fetch = fetch,
): Promise<HostRegistryRemoteState> {
  const slug = hostSlugOrThrow();
  const token = managementTokenOrThrow();
  const origins = body.origins !== undefined ? mergeRegistryOrigins(body.origins) : undefined;
  const res = await fetchImpl(`${registryBaseUrl()}/v1/hosts/${slug}/registry`, {
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
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(
      typeof json.error === "string" ? json.error : `Registry update failed (${res.status})`,
    );
  }
  return {
    ...mapRegistryResponse(json),
    serverOrigin: readServerPublicOrigin(),
    trustBaseUrlOriginConfigured: envRegistryTrustBaseUrlOrigin(),
  };
}

export async function syncHostRegistryOnStartup(fetchImpl: typeof fetch = fetch): Promise<void> {
  if (!envRegistryTrustBaseUrlOrigin()) {
    return;
  }
  const state = await fetchHostRegistryState(fetchImpl);
  const merged = mergeRegistryOrigins(state.origins);
  const unchanged =
    merged.length === state.origins.length &&
    merged.every((origin) => state.origins.includes(origin));
  if (unchanged) {
    return;
  }
  await updateHostRegistryState({ origins: state.origins }, fetchImpl);
}
