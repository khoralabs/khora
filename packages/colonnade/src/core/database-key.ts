import type { ColonnadeDatabaseId, ColonnadeDatabaseKind } from "./database-id";

function sanitizePathPart(part: string, label: string): string {
  const trimmed = part.trim();
  if (trimmed.length === 0) throw new Error(`${label} is required`);
  if (trimmed.includes("\0")) {
    throw new Error(`${label} must not contain null characters`);
  }
  if (trimmed.includes("/") || trimmed.includes("\\")) {
    throw new Error(`${label} must not contain path separators`);
  }
  return trimmed;
}

export function validateDatabaseKind(kind: string): ColonnadeDatabaseKind {
  return sanitizePathPart(kind, "Database kind");
}

export function validateOwnerKey(ownerKey: string): string {
  return sanitizePathPart(ownerKey, "Owner key");
}

export function validateColonnadeDatabaseId(id: ColonnadeDatabaseId): ColonnadeDatabaseId {
  return {
    kind: validateDatabaseKind(id.kind),
    ownerKey: validateOwnerKey(id.ownerKey),
  };
}

/** In-memory / cache key (`kind\\0ownerKey`). */
export function cacheKeyForId(id: ColonnadeDatabaseId): string {
  const validated = validateColonnadeDatabaseId(id);
  return `${validated.kind}\0${validated.ownerKey}`;
}

export function databaseKey(id: ColonnadeDatabaseId): string {
  return cacheKeyForId(id);
}

export function parseDatabaseKey(key: string): ColonnadeDatabaseId | undefined {
  const sep = key.indexOf("\0");
  if (sep < 0) return undefined;
  const kind = key.slice(0, sep);
  const ownerKey = key.slice(sep + 1);
  if (kind.length === 0 || ownerKey.length === 0) return undefined;
  return { kind, ownerKey };
}
