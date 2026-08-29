/**
 * Thin composition helpers commonly used by apps/registry.
 * Prefer subpath imports (`@khoralabs/registry/host`, `/persistence`, …) elsewhere.
 */

export type { RegistryHostContext, RegistryIdentityRoutes } from "./host/index";
export {
  createRegistryHost,
  createRegistryIdentityRoutes,
  readRegistryTrustedOrigins,
} from "./host/index";
export type { RegistryDatabase } from "./persistence/core/index";
export { initRegistryDomainSchema } from "./persistence/core/index";
