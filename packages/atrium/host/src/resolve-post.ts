import type { AtriumPost } from "@khoralabs/atrium-contracts";
import { zAtriumPost } from "@khoralabs/atrium-contracts";
import type { OutboxListedRecord, SqliteColonnadeCluster } from "@khoralabs/colonnade-persistence";
import { decodePostId } from "./post-address-id.ts";

export async function resolvePostById(
  cluster: SqliteColonnadeCluster,
  id: string,
): Promise<AtriumPost | undefined> {
  const address = decodePostId(id);
  if (address === undefined) {
    return undefined;
  }
  const cell = cluster.resolveCell(address.authorCellId);
  const fetched = await cell.fetchOutboxPayload({
    cell_id: address.authorCellId,
    locator: { cell_id: address.authorCellId, record_key: address.recordKey },
  });
  if (!fetched.bytes_available) {
    return undefined;
  }
  try {
    const raw = JSON.parse(new TextDecoder().decode(fetched.payload_bytes)) as unknown;
    const post = zAtriumPost.parse(raw);
    if (post.id !== id) {
      return undefined;
    }
    return post;
  } catch {
    return undefined;
  }
}

export async function listAuthorOutboxRecords(params: {
  cluster: SqliteColonnadeCluster;
  authorPrincipalId: string;
  authorCellId: string;
  tenantKey: string;
  postKind?: string;
  limit: number;
}): Promise<readonly OutboxListedRecord[]> {
  const cell = cluster.resolveCell(params.authorCellId);
  return cell.listOutboxRecordsForPrincipal({
    cell_id: params.authorCellId,
    tenant_key: params.tenantKey,
    principal_id: params.authorPrincipalId,
    ...(params.postKind !== undefined ? { post_kind: params.postKind } : {}),
    limit: params.limit,
  });
}

export async function deletePostOutboxRecord(
  cluster: SqliteColonnadeCluster,
  postId: string,
): Promise<boolean> {
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
}

export type { OutboxListedRecord };
