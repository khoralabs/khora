import type { Database } from "bun:sqlite";
import { initRegistryHostRuntime } from "./runtime";

/** Minimal runtime for unit tests that call route handlers directly. */
export function initTestRegistryHostRuntime(db: Database): void {
  initRegistryHostRuntime({
    db,
    identity: {
      getSession: async () => null,
      getSessionCookieHeader: () => null,
    },
    consoleAuth: null,
    publicUrl: () => process.env.REGISTRY_URL?.replace(/\/$/, "") ?? "http://localhost:4000",
    trustedOrigins: () => [],
  });
}
