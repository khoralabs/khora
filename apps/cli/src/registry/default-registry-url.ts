/** Default registry when config/env do not set registryUrl. Overridable at compile time via --define. */
export function defaultRegistryUrl(): string {
  const fromBuild = import.meta.env.KHORA_DEFAULT_REGISTRY_URL as string | undefined;
  if (fromBuild !== undefined && fromBuild.trim().length > 0) {
    return fromBuild.trim().replace(/\/$/, "");
  }
  return "https://r.khoralabs.com";
}
