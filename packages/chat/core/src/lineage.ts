import type { CommittedPost, PostVersion } from "./types.ts";

export function walkLineageFromHead<
  T extends Pick<PostVersion, "id" | "postId" | "previousPostVersionId">,
>(headVersionId: string, versionsById: Map<string, T>): T[] {
  const lineage: T[] = [];
  let currentId: string | null | undefined = headVersionId;
  const seenPostIds = new Set<string>();

  while (currentId) {
    const version = versionsById.get(currentId);
    if (!version) break;
    if (!seenPostIds.has(version.postId)) {
      lineage.push(version);
      seenPostIds.add(version.postId);
    }
    currentId = version.previousPostVersionId;
  }

  return lineage.reverse();
}

export function lineageBetween(
  headVersionId: string,
  ancestorVersionId: string,
  versionsById: Map<string, Pick<PostVersion, "id" | "postId" | "previousPostVersionId">>,
): Pick<PostVersion, "id" | "postId" | "previousPostVersionId">[] | null {
  const lineage = walkLineageFromHead(headVersionId, versionsById);
  const startIndex = lineage.findIndex((version) => version.id === ancestorVersionId);
  if (startIndex === -1) return null;
  return lineage.slice(startIndex);
}

export function postFromVersion(
  version: PostVersion,
  index: number,
  deletedAtMs?: number | null,
): CommittedPost {
  return {
    ...version,
    id: version.postId,
    status: "complete",
    versionId: version.id,
    previousVersionId: version.parentVersionId ?? null,
    index,
    updatedAtMs: version.parentVersionId ? version.createdAtMs : null,
    deletedAtMs: deletedAtMs ?? null,
  };
}
