import type { OutboxListedRecord, ResolvedSource } from "@khoralabs/colonnade-persistence";
import {
  createOutboxLocatorStore,
  OutboxGhostError,
  resolveSourcemap,
} from "@khoralabs/colonnade-persistence";
import type { KhoraPost } from "@khoralabs/khora-contracts";
import { zKhoraPost } from "@khoralabs/khora-contracts";
import type { KhoraColonnadeCluster, PostResolver } from "./ports";
import { decodePostId } from "./post-address-id";

export type { OutboxListedRecord };

async function resolvePostByIdFromCluster(
  cluster: KhoraColonnadeCluster,
  id: string,
): Promise<KhoraPost | undefined> {
  const address = decodePostId(id);
  if (address === undefined) {
    return undefined;
  }
  if (cluster.cellPoolCount !== undefined && address.cellPoolCount !== cluster.cellPoolCount) {
    return undefined;
  }
  const poolCount = cluster.cellPoolCount ?? address.cellPoolCount;
  const cell = cluster.resolveCell(address.authorCellId);
  const store = createOutboxLocatorStore(cell, poolCount);
  let resolved: ResolvedSource;
  try {
    resolved = await resolveSourcemap(
      {
        cell_id: address.authorCellId,
        record_key: address.recordKey,
        cell_pool_count: poolCount,
      },
      store,
    );
  } catch (e) {
    if (e instanceof OutboxGhostError) {
      return undefined;
    }
    throw e;
  }
  if (resolved.kind !== "blob") {
    return undefined;
  }
  try {
    const bytes = new Uint8Array(await resolved.blob.arrayBuffer());
    const raw = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    const post = zKhoraPost.parse(raw);
    if (post.id !== id) {
      return undefined;
    }
    return post;
  } catch {
    return undefined;
  }
}

export function createColonnadePostResolver(cluster: KhoraColonnadeCluster): PostResolver {
  return {
    resolvePostById(id) {
      return resolvePostByIdFromCluster(cluster, id);
    },
    async listAuthorOutboxRecords(params) {
      const cell = cluster.resolveCell(params.authorCellId);
      return cell.listOutboxRecordsForPrincipal({
        cell_id: params.authorCellId,
        tenant_key: params.tenantKey,
        principal_id: params.authorPrincipalId,
        ...(params.postKind !== undefined ? { post_kind: params.postKind } : {}),
        limit: params.limit,
      });
    },
    async deletePostOutboxRecord(postId) {
      const address = decodePostId(postId);
      if (address === undefined) {
        return false;
      }
      const cell = cluster.resolveCell(address.authorCellId);
      await cell.deleteOutboxRecord({
        cell_id: address.authorCellId,
        principal_id: address.authorPrincipalId,
        record_key: address.recordKey,
      });
      return true;
    },
  };
}

/** Convenience wrapper; prefer {@link PostResolver} on injected deps. */
export async function resolvePostById(
  cluster: KhoraColonnadeCluster,
  id: string,
): Promise<KhoraPost | undefined> {
  return resolvePostByIdFromCluster(cluster, id);
}

export async function listAuthorOutboxRecords(params: {
  cluster: KhoraColonnadeCluster;
  authorPrincipalId: string;
  authorCellId: string;
  tenantKey: string;
  postKind?: string;
  limit: number;
}): Promise<readonly OutboxListedRecord[]> {
  return createColonnadePostResolver(params.cluster).listAuthorOutboxRecords(params);
}

export async function deletePostOutboxRecord(
  cluster: KhoraColonnadeCluster,
  postId: string,
): Promise<boolean> {
  return createColonnadePostResolver(cluster).deletePostOutboxRecord(postId);
}
