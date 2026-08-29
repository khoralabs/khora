import {
  managementTokenOrThrow,
  type RegistryClientConfig,
  registryBaseUrl,
  slugOrThrow,
} from "./config";
import { mapRegistryResponse, parseJsonBody } from "./map-response";
import type { HostRegistryClientState } from "./types";

export async function fetchHostRegistryState(
  config: RegistryClientConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<HostRegistryClientState> {
  const slug = slugOrThrow(config);
  const token = managementTokenOrThrow(config);
  const res = await fetchImpl(`${registryBaseUrl(config)}/v1/hosts/${slug}/registry`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await parseJsonBody(res);
  if (!res.ok) {
    throw new Error(
      typeof json.error === "string" ? json.error : `Registry read failed (${res.status})`,
    );
  }
  return mapRegistryResponse(json, config);
}

export async function requestHostTrustedOriginRemote(
  config: RegistryClientConfig,
  origin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<HostRegistryClientState> {
  const slug = slugOrThrow(config);
  const token = managementTokenOrThrow(config);
  const res = await fetchImpl(
    `${registryBaseUrl(config)}/v1/hosts/${slug}/registry/origin-requests`,
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
    const json = await parseJsonBody(res);
    throw new Error(
      typeof json.error === "string" ? json.error : `Origin request failed (${res.status})`,
    );
  }
  return fetchHostRegistryState(config, fetchImpl);
}

export async function cancelHostTrustedOriginRequestRemote(
  config: RegistryClientConfig,
  requestId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<HostRegistryClientState> {
  const slug = slugOrThrow(config);
  const token = managementTokenOrThrow(config);
  const res = await fetchImpl(
    `${registryBaseUrl(config)}/v1/hosts/${slug}/registry/origin-requests/${encodeURIComponent(requestId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  const json = await parseJsonBody(res);
  if (!res.ok) {
    throw new Error(
      typeof json.error === "string" ? json.error : `Cancel origin request failed (${res.status})`,
    );
  }
  return mapRegistryResponse(json, config);
}

export async function requestHostTrustedOriginQuotaRemote(
  config: RegistryClientConfig,
  requestedIncluded: number,
  fetchImpl: typeof fetch = fetch,
): Promise<HostRegistryClientState> {
  const slug = slugOrThrow(config);
  const token = managementTokenOrThrow(config);
  const res = await fetchImpl(
    `${registryBaseUrl(config)}/v1/hosts/${slug}/registry/quota-requests`,
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
    const json = await parseJsonBody(res);
    throw new Error(
      typeof json.error === "string" ? json.error : `Quota request failed (${res.status})`,
    );
  }
  return fetchHostRegistryState(config, fetchImpl);
}

export async function cancelHostTrustedOriginQuotaRequestRemote(
  config: RegistryClientConfig,
  requestId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<HostRegistryClientState> {
  const slug = slugOrThrow(config);
  const token = managementTokenOrThrow(config);
  const res = await fetchImpl(
    `${registryBaseUrl(config)}/v1/hosts/${slug}/registry/quota-requests/${encodeURIComponent(requestId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  const json = await parseJsonBody(res);
  if (!res.ok) {
    throw new Error(
      typeof json.error === "string" ? json.error : `Cancel quota request failed (${res.status})`,
    );
  }
  return mapRegistryResponse(json, config);
}

export async function removeHostTrustedOriginRemote(
  config: RegistryClientConfig,
  origin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<HostRegistryClientState> {
  const slug = slugOrThrow(config);
  const token = managementTokenOrThrow(config);
  const res = await fetchImpl(`${registryBaseUrl(config)}/v1/hosts/${slug}/registry/origins`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ origin }),
  });
  const json = await parseJsonBody(res);
  if (!res.ok) {
    throw new Error(
      typeof json.error === "string" ? json.error : `Remove origin failed (${res.status})`,
    );
  }
  return mapRegistryResponse(json, config);
}
