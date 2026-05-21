function registryUrl(): string {
  const fromEnv = import.meta.env.BUN_PUBLIC_KHORA_REGISTRY_URL as string | undefined;
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return fromEnv.replace(/\/$/, "");
  }
  return "http://localhost:4000";
}

export function getRegistryUrl(): string {
  return registryUrl();
}
