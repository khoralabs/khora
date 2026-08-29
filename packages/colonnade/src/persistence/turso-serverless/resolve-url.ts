import type { ColonnadeDatabaseId, ColonnadeTursoServerlessBackendStrategy } from "../../core";
import { validateColonnadeDatabaseId } from "../../core";
import type { TursoCredentials } from "./client";

const CELL_ID_PLACEHOLDER = "{cellId}";
const SHARD_INDEX_PLACEHOLDER = "{shardIndex}";
const SHARD_PLACEHOLDER = "{shard}";
const OWNER_KEY_PLACEHOLDER = "{ownerKey}";
const KIND_PLACEHOLDER = "{kind}";

export type TursoUrlTemplateOptions = {
  readonly urlTemplate: string;
  readonly authToken?: string;
  readonly remoteEncryptionKey?: string;
};

/** Substitute `{cellId}`, `{shardIndex}`, and `{shard}` in a Turso URL template. */
export function resolveTursoUrl(
  options: TursoUrlTemplateOptions,
  cellId: string,
): TursoCredentials {
  const encoded = encodeURIComponent(cellId);
  const url = options.urlTemplate
    .replaceAll(CELL_ID_PLACEHOLDER, encoded)
    .replaceAll(SHARD_INDEX_PLACEHOLDER, encoded)
    .replaceAll(SHARD_PLACEHOLDER, encoded);
  return {
    url,
    authToken: options.authToken,
    remoteEncryptionKey: options.remoteEncryptionKey,
  };
}

/**
 * Resolve Turso credentials from a placement strategy for one `{ kind, ownerKey }` home.
 * Supports `{ownerKey}`, `{kind}`, and legacy `{cellId}` / `{shard}` / `{shardIndex}` placeholders.
 */
export function resolveTursoCredentialsFromStrategy(
  strategy: ColonnadeTursoServerlessBackendStrategy,
  id: ColonnadeDatabaseId,
  cellId: string,
): TursoCredentials {
  const validated = validateColonnadeDatabaseId(id);
  const encodedCell = encodeURIComponent(cellId);
  const url = strategy.url
    .replaceAll(OWNER_KEY_PLACEHOLDER, encodeURIComponent(validated.ownerKey))
    .replaceAll(KIND_PLACEHOLDER, encodeURIComponent(validated.kind))
    .replaceAll(CELL_ID_PLACEHOLDER, encodedCell)
    .replaceAll(SHARD_INDEX_PLACEHOLDER, encodedCell)
    .replaceAll(SHARD_PLACEHOLDER, encodedCell);
  return {
    url,
    authToken: strategy.authToken,
    remoteEncryptionKey: strategy.remoteEncryptionKey,
  };
}
