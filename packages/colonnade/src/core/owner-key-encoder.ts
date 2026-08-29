import path from "node:path";

import type { ColonnadeDatabaseId } from "./database-id";
import { validateColonnadeDatabaseId } from "./database-key";

export const OWNER_KEY_ENCODING_VERSION = "v1";
export const DATABASE_FILENAME = "database.db";

export type OwnerKeyEncoder = {
  encodeDatabaseId(id: ColonnadeDatabaseId): string;
  decodeDatabaseId(encoded: string): ColonnadeDatabaseId;
  databasePathSegments(id: ColonnadeDatabaseId): {
    version: string;
    encodedDatabaseId: string;
    filename: string;
  };
};

function bytesToBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function base64UrlToBytes(encoded: string): Uint8Array {
  return new Uint8Array(Buffer.from(encoded, "base64url"));
}

function canonicalDatabaseIdPayload(id: ColonnadeDatabaseId): string {
  return JSON.stringify([id.kind, id.ownerKey]);
}

function parseDatabaseIdPayload(payload: string): ColonnadeDatabaseId {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new Error("Encoded database id is invalid");
  }
  if (!Array.isArray(parsed) || parsed.length !== 2) {
    throw new Error("Encoded database id is invalid");
  }
  const [kind, ownerKey] = parsed;
  if (typeof kind !== "string" || typeof ownerKey !== "string") {
    throw new Error("Encoded database id is invalid");
  }
  return validateColonnadeDatabaseId({ kind, ownerKey });
}

/**
 * Reversible encoding of `{ kind, ownerKey }` for wire `CellId` and filesystem stems.
 * Path layout: `{dataDir}/v1/{encoded}/database.db`.
 */
export function createReversibleOwnerKeyEncoder(): OwnerKeyEncoder {
  return {
    encodeDatabaseId(id) {
      const validated = validateColonnadeDatabaseId(id);
      return bytesToBase64Url(new TextEncoder().encode(canonicalDatabaseIdPayload(validated)));
    },
    decodeDatabaseId(encoded) {
      const trimmed = encoded.trim();
      if (trimmed.length === 0) throw new Error("Encoded database id is required");
      const payload = new TextDecoder().decode(base64UrlToBytes(trimmed));
      return parseDatabaseIdPayload(payload);
    },
    databasePathSegments(id) {
      return {
        version: OWNER_KEY_ENCODING_VERSION,
        encodedDatabaseId: this.encodeDatabaseId(id),
        filename: DATABASE_FILENAME,
      };
    },
  };
}

const defaultEncoder = createReversibleOwnerKeyEncoder();

/** Encode a database id to the opaque wire `CellId` string. */
export function encodeCellId(
  id: ColonnadeDatabaseId,
  encoder: OwnerKeyEncoder = defaultEncoder,
): string {
  return encoder.encodeDatabaseId(id);
}

/** Decode a wire `CellId` to `{ kind, ownerKey }`. */
export function decodeCellId(
  encoded: string,
  encoder: OwnerKeyEncoder = defaultEncoder,
): ColonnadeDatabaseId {
  return encoder.decodeDatabaseId(encoded);
}

export function resolveEncodedDatabasePath(
  dataDir: string,
  id: ColonnadeDatabaseId,
  encoder: OwnerKeyEncoder = defaultEncoder,
): string {
  const validated = validateColonnadeDatabaseId(id);
  const segments = encoder.databasePathSegments(validated);
  return path.join(dataDir, segments.version, segments.encodedDatabaseId, segments.filename);
}
