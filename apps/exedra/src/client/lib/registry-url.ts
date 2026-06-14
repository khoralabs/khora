export function getRegistryUrl(): string {
  if (process.env.BUN_PUBLIC_EXEDRA_STUB_REGISTRY === "1") {
    if (typeof window !== "undefined") {
      return window.location.origin;
    }
  }
  const fromEnv = process.env.BUN_PUBLIC_KHORA_REGISTRY_URL;
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return fromEnv.replace(/\/$/, "");
  }
  return "http://localhost:4000";
}
