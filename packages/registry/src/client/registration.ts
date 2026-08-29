import { type RegistryClientConfig, registryBaseUrl, slugOrThrow } from "./config";
import { mapRegistrationResponse, parseJsonBody } from "./map-response";
import type { HostRegistrationClientState } from "./types";

export async function registerHostWithRegistryRemote(
  config: RegistryClientConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<HostRegistrationClientState> {
  const slug = slugOrThrow(config);
  const body: Record<string, string> = {
    slug,
    baseUrl: config.publicBaseUrl,
  };
  if (config.displayName !== undefined && config.displayName.length > 0) {
    body.displayName = config.displayName;
  }

  const res = await fetchImpl(`${registryBaseUrl(config)}/v1/hosts/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await parseJsonBody(res);
  if (!res.ok) {
    throw new Error(
      typeof json.error === "string" ? json.error : `Registration failed (${res.status})`,
    );
  }
  return mapRegistrationResponse(json, config);
}

export async function fetchHostRegistrationStatus(
  config: RegistryClientConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<HostRegistrationClientState> {
  const slug = slugOrThrow(config);
  if (config.registrationSecret === undefined) {
    throw new Error("Registration secret is not configured");
  }
  const res = await fetchImpl(`${registryBaseUrl(config)}/v1/hosts/${slug}/registration`, {
    headers: { Authorization: `Bearer ${config.registrationSecret}` },
  });
  const json = await parseJsonBody(res);
  if (!res.ok) {
    throw new Error(
      typeof json.error === "string" ? json.error : `Registration status failed (${res.status})`,
    );
  }
  return mapRegistrationResponse(json, config);
}

export async function claimHostRegistration(
  config: RegistryClientConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<HostRegistrationClientState> {
  const slug = slugOrThrow(config);
  if (config.registrationSecret === undefined) {
    throw new Error("Registration secret is not configured");
  }
  const res = await fetchImpl(`${registryBaseUrl(config)}/v1/hosts/${slug}/registration/claim`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.registrationSecret}` },
  });
  const json = await parseJsonBody(res);
  if (!res.ok) {
    throw new Error(typeof json.error === "string" ? json.error : `Claim failed (${res.status})`);
  }
  return mapRegistrationResponse(json, config);
}
