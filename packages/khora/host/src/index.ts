export type {
  KhoraSearchHit,
  KhoraSearchHydratedEntity,
  KhoraSearchQuery,
  KhoraSearchRequest,
  KhoraSearchResponse,
} from "@khoralabs/khora-contracts";
export { createKhoraCatalogApi, type KhoraHostCatalogApi } from "./catalog-facade";
export type { KhoraHostContext } from "./context";
export { createKhoraHost } from "./khora-host";
export type { KhoraHostDeps } from "./khora-host-deps";
export {
  type BootstrapKhoraMemoriesOpts,
  bootstrapKhoraMemories,
  type KhoraMemoriesHost,
} from "./memories/bootstrap";
export {
  executeKhoraMemoriesSearch,
  khoraSearchRequestFromGetQuery,
} from "./memories/khora-memories-search";
export { DEFAULT_KHORA_MEMORIES_NAMESPACE_ROOT } from "./memories/memories-config";
export {
  enqueuePendingEmbedding,
  ensurePendingEmbeddingsTable,
  type PendingEmbeddingQueueHandle,
  type PendingEmbeddingQueueSummary,
  type PendingEmbeddingQueueSummaryRow,
  purgeEmptyPendingEmbeddings,
  type RunPendingEmbeddingRetryBatchResult,
  readPendingEmbeddingQueueSummary,
  resetFailedPendingEmbeddings,
  runPendingEmbeddingRetryBatch,
  startEmbeddingRetryWorker,
} from "./memories/pending-embeddings";
export { assignPostAddress } from "./on-event";
export {
  bootstrapKhoraPercolator,
  type KhoraPercolatorHost,
} from "./percolator/bootstrap";
export {
  authorSubscriptionSearch,
  authorTopicSubscriptionSearch,
  topicSubscriptionSearch,
} from "./percolator/subscription-searches";
export { topicSlugsToLabelKinds, topicSlugToLabelKind } from "./percolator/topic-labels";
export {
  type CatalogProjectionListedRow,
  CatalogProjectionStore,
  escapeSqlLikeLiteral,
} from "./persistence/catalog-projection-store";
export {
  type ColonnadeBasePersistence,
  createKhoraPersistenceFromDatabases,
  createKhoraSocial,
} from "./persistence/colonnade-persistence";
export { countRegisteredPrincipals } from "./persistence/count-registered-principals";
export {
  DEFAULT_TENANT_KEY,
  NAMESPACE_ENTITY_PROFILE,
  NAMESPACE_HOST_SPEC,
  NAMESPACE_PRINCIPAL_TO_USERNAME,
  NAMESPACE_REG_BY_PRINCIPAL,
  NAMESPACE_REG_BY_PROFILE,
  NAMESPACE_SOCIAL_RELATIONSHIP,
  NAMESPACE_USERNAME_TO_PRINCIPAL,
  TABLE_SOCIAL_PRINCIPAL_CHANNELS,
  USERNAME_INDEX_TENANT_KEY,
} from "./persistence/id-conventions";
export {
  createPrincipalLifecycle,
  type PrincipalLifecycleDeps,
} from "./persistence/principal-lifecycle";
export {
  applyKhoraSqlitePragmas,
  ensureKhoraCatalogProjectionsSchema,
  openKhoraCatalogDb,
} from "./persistence/sqlite-setup";
export type {
  KhoraAdminCatalogStats,
  KhoraAdminCellDetail,
  KhoraAdminCellDetailResult,
  KhoraAdminCellShardSummary,
  KhoraAdminCellsSummary,
  KhoraAdminHeartbeatStats,
  KhoraAdminInactiveMember,
  KhoraAdminInactiveMemberReason,
  KhoraAdminInactiveMembersResult,
  KhoraAdminInviteStats,
  KhoraAdminNetworkActivityStats,
  KhoraAdminPrincipalDetail,
  KhoraAdminPrincipalDetailResult,
  KhoraAdminStatsPort,
  KhoraAdminStatsSummary,
  KhoraAdminTeardownStats,
  KhoraColonnadeCluster,
  KhoraHostHealthPort,
  KhoraHostSpecPort,
  PostResolver,
} from "./ports";
export {
  authorPrincipalIdFromPostId,
  type DecodedPostAddress,
  decodePostId,
  encodePostId,
  type PostAddressInput,
} from "./post-address-id";
export { canDeliverPostToRecipient, canReadPost } from "./post-visibility";
export { enqueueCellInboxInline } from "./relay-cell-inbox";
export {
  popRelayInboxDrainItemsForDid,
  type RelayInboxDrainItem,
} from "./relay-inbox-drain";
export {
  createColonnadePostResolver,
  deletePostOutboxRecord,
  listAuthorOutboxRecords,
  resolvePostById,
} from "./resolve-post";
export {
  authorDidFromSubscriptionSubject,
  authorSubscriptionSubject,
  authorTopicSubscriptionSubject,
  parseAuthorTopicSubscriptionSubject,
} from "./subject-keys";
