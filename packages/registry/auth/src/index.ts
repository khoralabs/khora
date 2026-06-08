export type { RegistrySession } from "@khoralabs/registry-host";
export { getRegistryAuth, registryAuth, reloadRegistryAuth } from "./auth";
export { createRegistryAuth, type RegistryAuth, type RegistryAuthOptions } from "./auth-config";
export { createBetterAuthRegistryIdentity } from "./better-auth-identity";
export {
  type BetterAuthRegistryRoutesDeps,
  createBetterAuthRegistryRoutes,
} from "./better-auth-routes";
export { bootstrapStaffEmails, isBootstrapStaffEmail, normalizeEmail } from "./bootstrap";
export { createUsersAuthClient } from "./client";
export { getRegistryDatabase, registryDatabasePath, resetRegistryDatabase } from "./db";
export { ensureRegistrySchema } from "./ensure-schema";
export { initAuthSchema, initRegistrySchema } from "./schema";
export { getRegistrySession } from "./session";
export { getRegistrySessionCookieHeader, getRegistrySessionToken } from "./session-token";
export { verifyRegistrySession } from "./verify-registry-session";
