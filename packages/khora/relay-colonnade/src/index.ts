export type { AgentRelayPersistence } from "@khoralabs/host-runtime";
export {
  type AgentAccountStatus,
  type AgentAccountStatusPort,
  createAgentAccountStatusPort,
} from "./agent-account-status";
export {
  type CatalogProjectionListedRow,
  escapeSqlLikeLiteral,
  RelayCatalogProjectionStore,
} from "./catalog-projection-store";
export { countRegisteredPrincipals } from "./count-registered-principals";
export { createRelayColonnadeSocial } from "./create-relay-colonnade-social";
export {
  createRelayPrincipalLifecycle,
  type RelayPrincipalLifecycle,
  type RelayPrincipalLifecycleDeps,
} from "./principal-lifecycle";
export { ensurePrincipalTeardownJobsSchema } from "./principal-teardown-jobs";
export {
  type PrincipalTeardownWorkerHandle,
  startPrincipalTeardownWorker,
} from "./principal-teardown-worker";
export {
  createRelayColonnadePersistence,
  createRelayColonnadePersistenceFromDatabases,
  RELAY_CATALOG_SOURCE_PROFILE,
  RELAY_CATALOG_SOURCE_TOPIC,
} from "./relay-colonnade-persistence";
export {
  RELAY_CATALOG_REG_BY_PRINCIPAL,
  RELAY_CATALOG_REG_BY_PROFILE,
  RELAY_CATALOG_SUBS_BY_PRINCIPAL,
  RELAY_CATALOG_SUBS_BY_SUBJECT,
  RELAY_DEFAULT_TENANT_KEY,
  RELAY_NAMESPACE_ENTITY_PROFILE,
  RELAY_NAMESPACE_ENTITY_TOPIC,
  RELAY_NAMESPACE_HOST_SPEC,
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
  SOURCE_PRINCIPAL_TO_USERNAME,
  SOURCE_USERNAME_TO_PRINCIPAL,
  USERNAME_INDEX_TENANT_KEY,
} from "./relay-id-conventions";
export { RelaySocialPrincipalChannelStore } from "./relay-social-principal-channel-store";
export { registerAgentOnColonnadePersistence } from "./social-registration";
export { createSocialRelationshipPersistence } from "./social-relationship-persistence";
export type {
  SocialAgentIdentity,
  SocialRegisterAgentInput,
  SocialRelationshipPersistence,
  SocialRelationshipRow,
} from "./social-types";
export {
  applyRelaySqlitePragmas,
  ensureRelayCatalogProjectionsSchema,
  openRelayCatalogDb,
  openRelayFramesDb,
} from "./sqlite-setup";
