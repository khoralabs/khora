export type { CatalogPersistence } from "./catalog-persistence";
export { CatalogPersistenceClient } from "./catalog-persistence-client";
export type {
  CellBatchCapable,
  CellPersistence,
  DiscardInboxEntriesInput,
  ResolveCell,
} from "./cell-persistence";
export { supportsCellBatch } from "./cell-persistence";
export { CellPersistenceClient } from "./cell-persistence-client";
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
export { InMemoryCatalogPersistence } from "./in-memory-catalog-persistence";
export { InMemoryCellPersistence } from "./in-memory-cell-persistence";
export {
  defaultNoopCatalogPersistence,
  NoopCatalogPersistence,
} from "./noop-catalog-persistence";
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
export { ShardingCatalogPersistence } from "./sharding-catalog-persistence";
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
