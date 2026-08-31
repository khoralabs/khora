/**
 * Resolve the registry public base URL from env (no trailing slash).
 * Prefers REGISTRY_URL, then BETTER_AUTH_URL, then http://localhost:$PORT.
 * Empty / whitespace-only env values are treated as unset.
 */
export function resolveRegistryPublicUrl(env: NodeJS.ProcessEnv = process.env): string {
  const port = env.PORT?.trim() || "4000";
  const configured =
    env.REGISTRY_URL?.trim()?.replace(/\/$/, "") ||
    env.BETTER_AUTH_URL?.trim()?.replace(/\/$/, "") ||
    "";
  return configured || `http://localhost:${port}`;
}
