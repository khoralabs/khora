import type { ColonnadeDatabaseId, ColonnadeTursoServerlessBackendStrategy } from "../../core";
import { validateColonnadeDatabaseId } from "../../core";
import type { TursoCredentials } from "./client";

const OWNER_KEY_PLACEHOLDER = "{ownerKey}";
const KIND_PLACEHOLDER = "{kind}";

export type TursoUrlTemplateOptions = {
  readonly urlTemplate: string;
  readonly authToken?: string;
  readonly remoteEncryptionKey?: string;
};

/** Substitute `{ownerKey}` in a Turso URL template (e.g. catalog shard suffix). */
export function resolveTursoUrl(
  options: TursoUrlTemplateOptions,
  ownerKey: string,
): TursoCredentials {
  const url = options.urlTemplate.replaceAll(OWNER_KEY_PLACEHOLDER, encodeURIComponent(ownerKey));
  return {
    url,
    authToken: options.authToken,
    remoteEncryptionKey: options.remoteEncryptionKey,
  };
}

/**
 * Resolve Turso credentials from a placement strategy for one `{ kind, ownerKey }` home.
 * Supports `{ownerKey}` and `{kind}` placeholders only.
 */
export function resolveTursoCredentialsFromStrategy(
  strategy: ColonnadeTursoServerlessBackendStrategy,
  id: ColonnadeDatabaseId,
): TursoCredentials {
  const validated = validateColonnadeDatabaseId(id);
  const url = strategy.url
    .replaceAll(OWNER_KEY_PLACEHOLDER, encodeURIComponent(validated.ownerKey))
    .replaceAll(KIND_PLACEHOLDER, encodeURIComponent(validated.kind));
  return {
    url,
    authToken: strategy.authToken,
    remoteEncryptionKey: strategy.remoteEncryptionKey,
  };
}
