import type { TursoCredentials } from "./client";

const CELL_ID_PLACEHOLDER = "{cellId}";
const SHARD_INDEX_PLACEHOLDER = "{shardIndex}";
const SHARD_PLACEHOLDER = "{shard}";

export type TursoUrlTemplateOptions = {
  readonly urlTemplate: string;
  readonly authToken?: string;
  readonly remoteEncryptionKey?: string;
};

/** Parse shard index from `colonnade-shard-{N}` cell ids. */
export function parsePoolShardIndex(cellId: string): string | undefined {
  const m = /^colonnade-shard-(\d+)$/.exec(cellId);
  return m?.[1];
}

/** Substitute `{cellId}`, `{shardIndex}`, and `{shard}` in a Turso URL template. */
export function resolveTursoUrl(
  options: TursoUrlTemplateOptions,
  cellId: string,
): TursoCredentials {
  const shardIndex = parsePoolShardIndex(cellId) ?? cellId;
  const url = options.urlTemplate
    .replaceAll(CELL_ID_PLACEHOLDER, encodeURIComponent(cellId))
    .replaceAll(SHARD_INDEX_PLACEHOLDER, encodeURIComponent(shardIndex))
    .replaceAll(SHARD_PLACEHOLDER, encodeURIComponent(shardIndex));
  return {
    url,
    authToken: options.authToken,
    remoteEncryptionKey: options.remoteEncryptionKey,
  };
}
