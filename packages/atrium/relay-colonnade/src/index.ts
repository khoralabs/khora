export type { AgentRelayPersistence } from "@khoralabs/agent-relay";
export {
  type CatalogProjectionListedRow,
  escapeSqlLikeLiteral,
  RelayCatalogProjectionStore,
} from "./catalog-projection-store.ts";
export { createRelayColonnadeSocial } from "./create-relay-colonnade-social.ts";
export { createFrameChannelHubPersistenceSqlite } from "./frame-channel-sqlite.ts";
export {
  type ClaimedPrincipalTeardownJob,
  deletePrincipalTeardownJob,
  ensurePrincipalTeardownJobsSchema,
  insertPendingPrincipalTeardownJob,
  principalHasActiveTeardownJob,
  relayInboxAuthorPointerDeliverable,
  tryClaimNextPendingPrincipalTeardownJob,
} from "./principal-teardown-jobs.ts";
export {
  type PrincipalTeardownWorkerHandle,
  startPrincipalTeardownWorker,
} from "./principal-teardown-worker.ts";
export {
  createRelayColonnadePersistence,
  createRelayColonnadePersistenceFromDatabases,
  RELAY_CATALOG_SOURCE_PROFILE,
  RELAY_CATALOG_SOURCE_TOPIC,
} from "./relay-colonnade-persistence.ts";
export {
  RELAY_CATALOG_REG_BY_PRINCIPAL,
  RELAY_CATALOG_REG_BY_PROFILE,
  RELAY_CATALOG_SUBS_BY_PRINCIPAL,
  RELAY_CATALOG_SUBS_BY_SUBJECT,
  RELAY_DEFAULT_TENANT_KEY,
  RELAY_NAMESPACE_ENTITY_PROFILE,
  RELAY_NAMESPACE_ENTITY_TOPIC,
  RELAY_NAMESPACE_PRINCIPAL_TO_USERNAME,
  RELAY_NAMESPACE_REG_BY_PRINCIPAL,
  RELAY_NAMESPACE_REG_BY_PROFILE,
  RELAY_NAMESPACE_ROOM_INVITE,
  RELAY_NAMESPACE_ROOM_REGISTRY,
  RELAY_NAMESPACE_SOCIAL_RELATIONSHIP,
  RELAY_NAMESPACE_SOCIAL_RELATIONSHIPS_BY_PRINCIPAL,
  RELAY_NAMESPACE_SUBS_BY_PRINCIPAL,
  RELAY_NAMESPACE_SUBS_BY_SUBJECT,
  RELAY_NAMESPACE_USERNAME_TO_PRINCIPAL,
  RELAY_TABLE_SOCIAL_PRINCIPAL_CHANNELS,
  RELAY_TABLE_SUBSCRIPTION_EDGES,
  SOURCE_PRINCIPAL_TO_USERNAME,
  SOURCE_USERNAME_TO_PRINCIPAL,
  USERNAME_INDEX_TENANT_KEY,
} from "./relay-id-conventions.ts";
export { registerAgentOnColonnadePersistence } from "./social-registration.ts";
export {
  RelaySocialPrincipalChannelStore,
} from "./relay-social-principal-channel-store.ts";
export {
  RelaySubscriptionEdgeStore,
} from "./relay-subscription-edge-store.ts";
export { createSocialRelationshipPersistence } from "./social-relationship-persistence.ts";
export type {
  SocialAgentIdentity,
  SocialRegisterAgentInput,
  SocialRelationshipPersistence,
  SocialRelationshipRow,
} from "./social-types.ts";
export {
  cascadeUnregisterColonnadePrincipal,
  cascadeUnregisterColonnadePrincipalWithProfile,
  phase1UnregisterColonnadePrincipal,
} from "./social-unregister.ts";
export {
  applyRelaySqlitePragmas,
  ensureRelayCatalogProjectionsSchema,
  openRelayCatalogDb,
  openRelayFramesDb,
} from "./sqlite-setup.ts";
