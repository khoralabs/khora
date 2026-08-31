/** Whether a path is served by identity routes or the federation/ops host fetch. */
export type RegistryDispatchKind = "identity" | "host";

export function registryDispatchKind(path: string): RegistryDispatchKind {
  if (
    path.startsWith("/api/auth") ||
    path.startsWith("/v1/device") ||
    path.startsWith("/agent/auth") ||
    path.startsWith("/.well-known/")
  ) {
    return "identity";
  }
  return "host";
}
