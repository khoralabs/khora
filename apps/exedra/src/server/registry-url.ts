export function getRegistryUrl(): string {
  const fromEnv = process.env.REGISTRY_URL ?? process.env.BUN_PUBLIC_KHORA_REGISTRY_URL;
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return fromEnv.replace(/\/$/, "");
  }
  return "http://localhost:4000";
}
