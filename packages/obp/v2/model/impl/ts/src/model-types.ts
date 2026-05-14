/**
 * TypeScript models for **`cfd.obp`** graph vocabulary — see
 * `packages/obp/v2/model/spec/model/shapes.smithy`.
 */

/** Smithy `Document` — JSON-compatible value (`cfd.obp` persistence surface). */
export type JsonDocument =
  | null
  | boolean
  | number
  | string
  | readonly JsonDocument[]
  | { readonly [key: string]: JsonDocument };

/** `Sha256HexLower` — lowercase hex SHA-256 digest, length 64, no `0x`. */
export type Sha256HexLower = string & { readonly __brand?: "Sha256HexLower" };

const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

export function isSha256HexLower(s: string): s is Sha256HexLower {
  return SHA256_HEX_RE.test(s);
}

export function toSha256HexLower(s: string): Sha256HexLower {
  if (!SHA256_HEX_RE.test(s)) {
    throw new TypeError("expected 64-char lowercase hex Sha256HexLower");
  }
  return s as Sha256HexLower;
}

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

/** Optional provenance link; fields are opaque to the protocol. */
export type SourceMapRef = {
  resource_id: string;
  source_key: string;
};

export type SourceMapRefList = readonly SourceMapRef[];

/** Content receipt: source addressing + digest commitment. */
export type ContentAddressedSourceRef = {
  resource_id: string;
  source_key: string;
  content_sha256_hex: Sha256HexLower;
};

export type ContentAddressedSourceRefList = readonly ContentAddressedSourceRef[];

// ---------------------------------------------------------------------------
// Graph nodes
// ---------------------------------------------------------------------------

/** Issuing actor. Implementations SHOULD use UUID v7 ids. */
export type Party = {
  id: string;
  name: string;
  sourcemaps: SourceMapRefList;
};

/**
 * Proposal or workflow step.
 * `expires_seq` — minimum ledger sequence at which this offer is no longer bindable.
 * Row `created_seq` is NBC/persistence (`NbcRowCommitMeta`), not on this shape.
 */
export type Offer = {
  id: string;
  expires_seq: bigint;
  type: string;
  sourcemaps: SourceMapRefList;
};

/**
 * Affordance / continuation point.
 * `promise` defaults to `""` (empty when not specified on wire).
 * `ref` defaults to `""` (non-empty aliases another port; implementations MUST detect cycles).
 */
export type Port = {
  id: string;
  expires_seq: bigint;
  type: string;
  promise: string;
  ref: string;
  sourcemaps: SourceMapRefList;
};

// ---------------------------------------------------------------------------
// Graph edges
// ---------------------------------------------------------------------------

/** Party -[EXTENDS]-> Offer. */
export type ExtendsEdge = {
  id: string;
  sourcemaps: SourceMapRefList;
};

/** Offer -[EXPOSES]-> Port. */
export type ExposesEdge = {
  id: string;
  sourcemaps: SourceMapRefList;
};

/**
 * Offer -[BINDS]-> Port — graph identity and provenance only.
 * Policy-shaped payloads (`NbcBindSatisfaction`, `NbcBindPolicyAuditSnapshot`) and
 * `bind_payload` / `bind_policy_snapshot` live on the persistence listing row, not here.
 */
export type BindsEdge = {
  id: string;
  sourcemaps: SourceMapRefList;
  content_receipts: ContentAddressedSourceRefList;
};

/** Service version for `ObpPersistence` in Smithy. */
export const OBP_PERSISTENCE_VERSION = "2026-05-01" as const;
