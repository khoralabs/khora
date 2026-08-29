export type { RegistrySession } from "../host/ports/identity";
export { getRegistryAuth, registryAuth, reloadRegistryAuth } from "./auth";
export {
  createRegistryAuth,
  type RegistryAuth,
  type RegistryAuthDatabase,
  type RegistryAuthOptions,
} from "./auth-config";
export type { RegistryAuthDatabaseSchema, RegistryAuthKysely } from "./auth-database-schema";
export { createBetterAuthRegistryIdentity } from "./better-auth-identity";
export {
  type BetterAuthRegistryRoutesDeps,
  createBetterAuthRegistryRoutes,
} from "./better-auth-routes";
export { bootstrapStaffEmails, isBootstrapStaffEmail, normalizeEmail } from "./bootstrap";
export { createUsersAuthClient } from "./client";
/** @deprecated Prefer `@khoralabs/registry/sqlite` — kept for tests and legacy app helpers. */
export {
  getRegistryDatabase,
  getRegistryDomainDatabase,
  registryDatabasePath,
  resetRegistryDatabase,
} from "./db";
export { ensureRegistrySchema } from "./ensure-schema";
export { initAuthSchema, initRegistrySchema } from "./schema";
export { getRegistrySession } from "./session";
export { getRegistrySessionCookieHeader, getRegistrySessionToken } from "./session-token";
export { verifyRegistrySession } from "./verify-registry-session";
