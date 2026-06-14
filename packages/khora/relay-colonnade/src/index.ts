export type { HostPersistence } from "@khoralabs/host-runtime";
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
} from "./relay-colonnade-persistence";
export {
  RELAY_DEFAULT_TENANT_KEY,
  RELAY_NAMESPACE_ENTITY_PROFILE,
  RELAY_NAMESPACE_HOST_SPEC,
  RELAY_NAMESPACE_PRINCIPAL_TO_USERNAME,
  RELAY_NAMESPACE_REG_BY_PRINCIPAL,
  RELAY_NAMESPACE_REG_BY_PROFILE,
  RELAY_NAMESPACE_SOCIAL_RELATIONSHIP,
  RELAY_NAMESPACE_USERNAME_TO_PRINCIPAL,
  RELAY_TABLE_SOCIAL_PRINCIPAL_CHANNELS,
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
} from "./sqlite-setup";
