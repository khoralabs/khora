export type { AgentRelayPersistence } from "@khoralabs/agent-relay";
export {
  deleteRelayInboxRowsForPostId,
  purgeRelayCatalogPostEntity,
  RELAY_CATALOG_SOURCE_POST,
} from "./catalog-post-adapter.ts";
export {
  type CatalogSourceMapListedRow,
  escapeSqlLikeLiteral,
  RelayCatalogSourceMapStore,
  relaySyntheticPointer,
} from "./catalog-source-map-store.ts";
export { createFrameChannelHubPersistenceSqlite } from "./frame-channel-sqlite.ts";
export {
  createRelayColonnadePersistence,
  createRelayColonnadePersistenceFromDatabases,
} from "./relay-colonnade-persistence.ts";
export { applyRelaySqlitePragmas, openRelayCatalogDb, openRelayFramesDb } from "./sqlite-setup.ts";
export { createRelayColonnadeSocial } from "./create-relay-colonnade-social.ts";
export {
  cascadeUnregisterColonnadePrincipal,
  cascadeUnregisterColonnadePrincipalWithProfile,
  phase1UnregisterColonnadePrincipal,
} from "./social-unregister.ts";
export {
  deletePrincipalTeardownJob,
  ensurePrincipalTeardownJobsSchema,
  insertPendingPrincipalTeardownJob,
  principalHasActiveTeardownJob,
  relayInboxAuthorPointerDeliverable,
  tryClaimNextPendingPrincipalTeardownJob,
  type ClaimedPrincipalTeardownJob,
} from "./principal-teardown-jobs.ts";
export {
  startPrincipalTeardownWorker,
  type PrincipalTeardownWorkerHandle,
} from "./principal-teardown-worker.ts";
export {
  registerAgentOnColonnadePersistence,
  SOURCE_PRINCIPAL_TO_USERNAME,
  SOURCE_USERNAME_TO_PRINCIPAL,
  USERNAME_INDEX_TENANT_KEY,
} from "./social-registration.ts";
export { createSocialRelationshipPersistence } from "./social-relationship-persistence.ts";
export type {
  SocialAgentIdentity,
  SocialRegisterAgentInput,
  SocialRelationshipPersistence,
  SocialRelationshipRow,
} from "./social-types.ts";
