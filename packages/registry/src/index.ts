/**
 * Thin composition helpers commonly used by apps/registry.
 * Prefer subpath imports (`@khoralabs/khora-registry/host`, `/persistence`, …) elsewhere.
 */

export type {
  ComposeRegistryHostDeps,
  RegistryHostContext,
  RegistryIdentityRoutes,
} from "./host/index";
export {
  composeRegistryHost,
  createRegistryHost,
  createRegistryIdentityRoutes,
  readRegistryTrustedOrigins,
  resolveRegistryPublicUrl,
} from "./host/index";
export type { RegistryDatabase } from "./persistence/core/index";
export { initRegistryDomainSchema } from "./persistence/core/index";
