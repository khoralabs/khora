import {
  encodePrincipalIdForMemories,
  MEMORY_PRINCIPAL_SEGMENT_LENGTH,
} from "./encode-principal-id.js";

/** Previous encoding: full base64url of the principal id, lowercased (not reliably decodable). */
export function encodePrincipalIdForMemoriesLegacy(principalId: string): string {
  return Buffer.from(principalId, "utf8").toString("base64url").toLowerCase();
}

export function buildPrincipalSegmentMigrationMap(
  principalIds: readonly string[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const principalId of principalIds) {
    const legacy = encodePrincipalIdForMemoriesLegacy(principalId);
    const next = encodePrincipalIdForMemories(principalId);
    if (legacy !== next) map.set(legacy, next);
  }
  return map;
}

export function migrateNamespacePathWithSegmentMap(
  path: string,
  segmentMap: ReadonlyMap<string, string>,
): string {
  return path
    .split("/")
    .map((segment) => segmentMap.get(segment) ?? segment)
    .join("/");
}

export function memoriesDbUsesLegacyFilename(basename: string): boolean {
  return basename.length > MEMORY_PRINCIPAL_SEGMENT_LENGTH;
}

export function legacyMemoriesDbBasename(principalId: string): string {
  return encodePrincipalIdForMemoriesLegacy(principalId);
}

export function currentMemoriesDbBasename(principalId: string): string {
  return encodePrincipalIdForMemories(principalId);
}
