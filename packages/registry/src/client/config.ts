export type RegistryClientConfig = {
  registryUrl: string;
  slug: string | undefined;
  publicBaseUrl: string;
  displayName?: string;
  registrationSecret?: string;
  managementToken?: string;
  /**
   * When true, treat the host public base URL origin as a trusted-origin
   * candidate (merge / startup sync). Callers pass their env flag.
   */
  trustBaseUrlOrigin?: boolean;
};

export function slugOrThrow(config: RegistryClientConfig): string {
  if (config.slug === undefined) {
    throw new Error("Host slug is not configured");
  }
  return config.slug;
}

export function managementTokenOrThrow(config: RegistryClientConfig): string {
  if (config.managementToken === undefined) {
    throw new Error("Management token is not configured");
  }
  return config.managementToken;
}

export function readServerPublicOrigin(config: RegistryClientConfig): string {
  return new URL(config.publicBaseUrl).origin;
}

export function mergeRegistryOrigins(
  config: RegistryClientConfig,
  origins: string[],
  trustBaseUrlOrigin = config.trustBaseUrlOrigin === true,
): string[] {
  const merged = [...origins];
  if (trustBaseUrlOrigin) {
    merged.push(readServerPublicOrigin(config));
  }
  return [...new Set(merged.map((origin) => origin.trim()).filter((origin) => origin.length > 0))];
}

export function registryBaseUrl(config: RegistryClientConfig): string {
  return config.registryUrl.replace(/\/$/, "");
}
