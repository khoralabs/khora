/** Default registry when config/env do not set registryUrl. Overridable at compile time via --define. */
export function defaultRegistryUrl(): string {
  const metaEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  const fromBuild = metaEnv?.KHORA_DEFAULT_REGISTRY_URL;
  if (fromBuild !== undefined && fromBuild.trim().length > 0) {
    return fromBuild.trim().replace(/\/$/, "");
  }
  return "https://r.khoralabs.com";
}
