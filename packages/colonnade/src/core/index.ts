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

export type ColonnadeClusterMode =
  | { readonly kind: "pool"; readonly cellCount: number }
  | { readonly kind: "per_principal" };
