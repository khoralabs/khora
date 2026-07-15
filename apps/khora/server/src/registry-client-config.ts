import type { RegistryClientConfig } from "@khoralabs/registry-client";

import { envRegistryTrustBaseUrlOrigin } from "./env";

/** Build registry client config from host-spec effective values + env policy. */
export function toRegistryClientConfig(config: {
  registryUrl: string;
  slug: string | undefined;
  publicBaseUrl: string;
  displayName?: string;
  registrationSecret?: string;
  managementToken?: string;
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
    trustBaseUrlOrigin: envRegistryTrustBaseUrlOrigin(),
  };
}
