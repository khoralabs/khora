/**
 * Thin composition helpers commonly used by apps/registry.
 * Prefer subpath imports (`@khoralabs/registry/host`, `/auth`, `/persistence`, …) elsewhere.
 */

export type { RegistryAuthDatabase } from "./auth/index";
export {
  createBetterAuthRegistryIdentity,
  createBetterAuthRegistryRoutes,
  initRegistrySchema,
  reloadRegistryAuth,
} from "./auth/index";
export type { RegistryHostContext, RegistryIdentityRoutes } from "./host/index";
export { createRegistryHost, readRegistryTrustedOrigins } from "./host/index";
export type { RegistryDatabase } from "./persistence/core/index";
