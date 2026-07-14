import {
  readAdminRootToken,
  readAdminTokenAuthKind,
  readAdminTokenLoginRateLimit,
  readSecureCookies,
} from "./env";
import { createRootTokenAdminAuth } from "./root-token";
import type { AdminTokenAuth } from "./types";

export {
  readAdminRootToken,
  readAdminTokenAuthKind,
  readAdminTokenLoginRateLimit,
  readSecureCookies,
} from "./env";
export { createRootTokenAdminAuth } from "./root-token";
export type { AdminPrincipal, AdminTokenAuth } from "./types";

/** Returns null when admin token auth is disabled (no root token configured). */
export function createAdminTokenAuthFromEnv(): AdminTokenAuth | null {
  const rootToken = readAdminRootToken();
  if (rootToken === undefined) return null;
  readAdminTokenAuthKind();
  return createRootTokenAdminAuth({
    rootToken,
    secureCookies: readSecureCookies(),
    loginRateLimit: readAdminTokenLoginRateLimit(),
  });
}
