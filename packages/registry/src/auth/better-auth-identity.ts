import type { RegistryIdentityPort } from "../host/ports/identity";
import { reloadRegistryAuth } from "./auth";
import { getRegistrySession } from "./session";
import { getRegistrySessionCookieHeader } from "./session-token";

export function createBetterAuthRegistryIdentity(
  opts: { resolveTrustedOrigins?: () => string[] | Promise<string[]> } = {},
): RegistryIdentityPort {
  if (opts.resolveTrustedOrigins !== undefined) {
    reloadRegistryAuth({ resolveTrustedOrigins: opts.resolveTrustedOrigins });
  }
  return {
    getSession: getRegistrySession,
    getSessionCookieHeader: getRegistrySessionCookieHeader,
    reloadTrustedOrigins() {
      if (opts.resolveTrustedOrigins !== undefined) {
        reloadRegistryAuth({ resolveTrustedOrigins: opts.resolveTrustedOrigins });
      }
    },
  };
}
