import type { RegistryDatabase } from "@khoralabs/registry/persistence";
import { initRegistryHostRuntime } from "./runtime";

/** Minimal runtime for unit tests that call route handlers directly. */
export function initTestRegistryHostRuntime(db: RegistryDatabase): void {
  initRegistryHostRuntime({
    db,
    identity: {
      getSession: async () => null,
      getSessionCookieHeader: () => null,
    },
    adminTokenAuth: null,
    publicUrl: () => process.env.REGISTRY_URL?.replace(/\/$/, "") ?? "http://localhost:4000",
    trustedOrigins: () => [],
  });
}
