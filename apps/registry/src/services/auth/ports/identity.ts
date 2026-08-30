import type { RegistryIdentityPort } from "@khoralabs/registry/host";
import { reloadRegistryAuth, revokeBetterAuthSessionsForUser } from "../instance";
import { getRegistrySession } from "../session";
import { getBetterAuthSessionCookieHeader } from "../session-cookie";

export function createBetterAuthRegistryIdentity(
  opts: { resolveTrustedOrigins?: () => string[] | Promise<string[]> } = {},
): RegistryIdentityPort {
  if (opts.resolveTrustedOrigins !== undefined) {
    reloadRegistryAuth({ resolveTrustedOrigins: opts.resolveTrustedOrigins });
  }
  return {
    getSession: getRegistrySession,
    getSessionCookieHeader: getBetterAuthSessionCookieHeader,
    reloadTrustedOrigins() {
      if (opts.resolveTrustedOrigins !== undefined) {
        reloadRegistryAuth({ resolveTrustedOrigins: opts.resolveTrustedOrigins });
      }
    },
    revokeSessionsForUser: revokeBetterAuthSessionsForUser,
  };
}
