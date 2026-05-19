/**
 * Canonical namespace / tenant constants for relay catalog projections.
 * Full ID conventions: packages/atrium/host/id-conventions.md
 */

/** Default relay tenant (`ATRIUM_RELAY_TENANT_KEY`). */
export const RELAY_DEFAULT_TENANT_KEY = "relay";

/** Global username index tenant (handles unique across relay tenants). */
export const USERNAME_INDEX_TENANT_KEY = "relay:username-index-global";

export const RELAY_NAMESPACE_ENTITY_PROFILE = "relay:entity:profile";
export const RELAY_NAMESPACE_ENTITY_TOPIC = "relay:entity:topic";
export const RELAY_NAMESPACE_REG_BY_PRINCIPAL = "relay:reg:by-principal";
export const RELAY_NAMESPACE_REG_BY_PROFILE = "relay:reg:by-profile";
/** @deprecated Subscriptions use `relay_subscription_edges` table. */
export const RELAY_NAMESPACE_SUBS_BY_PRINCIPAL = "relay:subs:by-principal";
/** @deprecated Subscriptions use `relay_subscription_edges` table. */
export const RELAY_NAMESPACE_SUBS_BY_SUBJECT = "relay:subs:by-subject";
export const RELAY_NAMESPACE_USERNAME_TO_PRINCIPAL = "relay:social:username-to-principal";
export const RELAY_NAMESPACE_PRINCIPAL_TO_USERNAME = "relay:social:principal-to-username";
export const RELAY_NAMESPACE_SOCIAL_RELATIONSHIP = "relay:social:relationship";
/** @deprecated Social principal index uses `relay_social_principal_channels` table. */
export const RELAY_NAMESPACE_SOCIAL_RELATIONSHIPS_BY_PRINCIPAL =
  "relay:social:relationships-by-principal";
export const RELAY_NAMESPACE_ROOM_REGISTRY = "at2:room-registry";
export const RELAY_NAMESPACE_ROOM_INVITE = "at2:room-invite";

/** Normalized subscription edges (replaces subs projection inverted sets). */
export const RELAY_TABLE_SUBSCRIPTION_EDGES = "relay_subscription_edges";
/** Normalized principal → channel index (replaces relationships-by-principal projections). */
export const RELAY_TABLE_SOCIAL_PRINCIPAL_CHANNELS = "relay_social_principal_channels";

// TODO: Remove
/** @deprecated use RELAY_NAMESPACE_* */
export const RELAY_CATALOG_SOURCE_PROFILE = RELAY_NAMESPACE_ENTITY_PROFILE;
/** @deprecated use RELAY_NAMESPACE_* */
export const RELAY_CATALOG_SOURCE_TOPIC = RELAY_NAMESPACE_ENTITY_TOPIC;
/** @deprecated use RELAY_NAMESPACE_* */
export const RELAY_CATALOG_REG_BY_PRINCIPAL = RELAY_NAMESPACE_REG_BY_PRINCIPAL;
/** @deprecated use RELAY_NAMESPACE_* */
export const RELAY_CATALOG_REG_BY_PROFILE = RELAY_NAMESPACE_REG_BY_PROFILE;
/** @deprecated use RELAY_TABLE_SUBSCRIPTION_EDGES */
export const RELAY_CATALOG_SUBS_BY_PRINCIPAL = RELAY_NAMESPACE_SUBS_BY_PRINCIPAL;
/** @deprecated use RELAY_TABLE_SUBSCRIPTION_EDGES */
export const RELAY_CATALOG_SUBS_BY_SUBJECT = RELAY_NAMESPACE_SUBS_BY_SUBJECT;
/** @deprecated use RELAY_NAMESPACE_* */
export const SOURCE_USERNAME_TO_PRINCIPAL = RELAY_NAMESPACE_USERNAME_TO_PRINCIPAL;
/** @deprecated use RELAY_NAMESPACE_* */
export const SOURCE_PRINCIPAL_TO_USERNAME = RELAY_NAMESPACE_PRINCIPAL_TO_USERNAME;
