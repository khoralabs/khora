/**
 * Canonical namespace / tenant constants for relay catalog projections.
 * Full ID conventions: packages/khora/host/id-conventions.md
 */

/** Default relay tenant (`KHORA_RELAY_TENANT_KEY`). */
export const RELAY_DEFAULT_TENANT_KEY = "relay";

/** Global username index tenant (handles unique across relay tenants). */
export const USERNAME_INDEX_TENANT_KEY = "relay:username-index-global";

export const RELAY_NAMESPACE_ENTITY_PROFILE = "relay:entity:profile";
export const RELAY_NAMESPACE_REG_BY_PRINCIPAL = "relay:reg:by-principal";
export const RELAY_NAMESPACE_REG_BY_PROFILE = "relay:reg:by-profile";
export const RELAY_NAMESPACE_USERNAME_TO_PRINCIPAL = "relay:social:username-to-principal";
export const RELAY_NAMESPACE_PRINCIPAL_TO_USERNAME = "relay:social:principal-to-username";
export const RELAY_NAMESPACE_SOCIAL_RELATIONSHIP = "relay:social:relationship";
/** Singleton host identity + registry connection (entry_key `self`). */
export const RELAY_NAMESPACE_HOST_SPEC = "khora:host-spec";

/** Normalized principal → channel index (replaces relationships-by-principal projections). */
export const RELAY_TABLE_SOCIAL_PRINCIPAL_CHANNELS = "relay_social_principal_channels";
