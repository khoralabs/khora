import type { RegistryClientConfig } from "@khoralabs/khora-registry/client";

function envRegistryTrustBaseUrlOrigin(): boolean {
  const v = process.env.KHORA_REGISTRY_TRUST_BASE_URL_ORIGIN?.trim().toLowerCase();
  return v === "1" || v === "true";
}

/** Build registry client config from host-spec effective values + env policy. */
export function toRegistryClientConfig(config: {
  registryUrl: string;
  slug: string | undefined;
  publicBaseUrl: string;
  displayName?: string;
  registrationSecret?: string;
  managementToken?: string;
  trustBaseUrlOrigin?: boolean;
}): RegistryClientConfig {
  return {
    registryUrl: config.registryUrl,
    slug: config.slug,
    publicBaseUrl: config.publicBaseUrl,
    ...(config.displayName !== undefined ? { displayName: config.displayName } : {}),
    ...(config.registrationSecret !== undefined
      ? { registrationSecret: config.registrationSecret }
      : {}),
    ...(config.managementToken !== undefined ? { managementToken: config.managementToken } : {}),
    trustBaseUrlOrigin: config.trustBaseUrlOrigin ?? envRegistryTrustBaseUrlOrigin(),
  };
}
