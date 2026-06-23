import type { GenerateResponseToolkitEnv } from "./types.ts";

export function assertAuthorizedMemoryNamespace(
  env: GenerateResponseToolkitEnv,
  namespace: string,
): void {
  if (!env.policyState.memoryNamespaces.some((item) => item.namespace === namespace)) {
    throw new Error(`memory namespace is not authorized: ${namespace}`);
  }
}
