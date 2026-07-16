export { CatalogPersistenceClient } from "./catalog-persistence-client";
export type { CatalogPersistenceStrategy } from "./catalog-persistence-strategy";
export { CellPersistenceClient } from "./cell-persistence-client";
export type {
  CellBatchCapable,
  CellPersistenceStrategy,
  DiscardInboxEntriesInput,
  ResolveCellStrategy,
} from "./cell-persistence-strategy";
export { supportsCellBatch } from "./cell-persistence-strategy";
export { ColonnadePublicationClient } from "./colonnade-publication-client";
export { ColonnadeRouter } from "./colonnade-router";
export type * from "./colonnade-types";
export {
  assertContentHash,
  canonicalSourceMapRowBytes,
  contentHashBytesToHex,
  contentHashHexToBytes,
  randomId,
  sha256HexLower,
  stableStringify,
} from "./hash";
export { InMemoryCatalogPersistenceStrategy } from "./in-memory-catalog-strategy";
export { InMemoryCellPersistenceStrategy } from "./in-memory-cell-strategy";
export {
  defaultNoopCatalogPersistenceStrategy,
  NoopCatalogPersistenceStrategy,
} from "./noop-catalog-strategy";
export type {
  OutboxContentRef,
  OutboxLocators,
  OutboxStore,
  PointerRef,
  PointerStore,
  ResolvedSource,
  SourceMapEntryRef,
} from "./resolve-pointer";
export {
  CellPoolCountMismatchError,
  createOutboxLocatorStore,
  createPointerStore,
  OutboxGhostError,
  PointerHashMismatchError,
  resolveSourcemap,
} from "./resolve-pointer";
export {
  encodeCatalogPointerId,
  parseCatalogPointerShardIndex,
} from "./routing/catalog-pointer-id";
export {
  cellDbFilenameStem,
  derivePoolHomeCell,
  perPrincipalCellId,
  poolShardCellId,
  stablePrincipalShardIndex,
} from "./routing/principal-cell-id";
export { catalogShardIndexForTenant } from "./routing/tenant-catalog-shard";
export { ShardingCatalogPersistenceStrategy } from "./sharding-catalog-strategy";
export {
  inboxStagingFromBlob,
  inboxStagingToBlob,
  writeOpFromBlob,
  writeOpToBlob,
} from "./staging-binary";

export type ColonnadeClusterMode =
  | { readonly kind: "pool"; readonly cellCount: number }
  | { readonly kind: "per_principal" };
export {
  CATALOG_TABLES_DDL,
  CELL_BASE_TABLES_DDL,
  CELL_INBOX_DDL,
  CELL_OUTBOX_META_DDL,
  CELL_WRITE_LOG_DDL,
  SCHEMA_VERSION_TABLE_DDL,
  TURSO_PRAGMAS_DDL,
} from "./schema";
