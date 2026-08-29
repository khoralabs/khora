import type { AdminTokenAuth } from "@khoralabs/khora-auth";
import type { RegistryDatabase } from "@khoralabs/registry/persistence";
import type { RegistryIdentityPort } from "./ports/identity";

export type RegistryHostRuntime = {
  db: RegistryDatabase;
  identity: RegistryIdentityPort;
  adminTokenAuth: AdminTokenAuth | null;
  publicUrl: () => string;
  trustedOrigins: () => string[];
};

let activeRuntime: RegistryHostRuntime | undefined;

export function initRegistryHostRuntime(runtime: RegistryHostRuntime): void {
  activeRuntime = runtime;
}

export function registryHostRuntime(): RegistryHostRuntime {
  if (activeRuntime === undefined) {
    throw new Error("Registry host runtime not initialized");
  }
  return activeRuntime;
}
