import { stableStringify } from "../hash";

/**
 * Backend routing descriptors for colonnade cell homes.
 *
 * Placement answers *where* a `{ kind, ownerKey }` home lives. Strategy `kind` is
 * extensible: today `sqlite` / `turso-serverless`; later `cell-node` (or similar)
 * can name remote multiplexed endpoints without changing InboxDelivery call sites.
 */
export type ColonnadeSqliteBackendStrategy = {
  readonly kind: "sqlite";
  readonly dataDir: string;
  readonly sqlCipherKey?: string;
};

export type ColonnadeTursoServerlessBackendStrategy = {
  readonly kind: "turso-serverless";
  /** Supports `{ownerKey}` and `{kind}` placeholders for per-principal databases. */
  readonly url: string;
  readonly authToken?: string;
  readonly remoteEncryptionKey?: string;
};

/**
 * Open strategy union. Unknown `kind` values are allowed so future remote cell-node
 * strategies can be stored in the placement registry before factories exist.
 */
export type ColonnadeBackendStrategy =
  | ColonnadeSqliteBackendStrategy
  | ColonnadeTursoServerlessBackendStrategy
  | (Record<string, unknown> & { readonly kind: string });

export function strategyCacheKey(strategy: ColonnadeBackendStrategy): string {
  return stableStringify(strategy);
}

export type SerializedBackendStrategy = {
  readonly kind: string;
  readonly json: string;
};

export function parseStrategy(json: string): ColonnadeBackendStrategy {
  return JSON.parse(json) as ColonnadeBackendStrategy;
}

export function serializeStrategy(strategy: ColonnadeBackendStrategy): SerializedBackendStrategy {
  return { kind: strategy.kind, json: JSON.stringify(strategy) };
}
