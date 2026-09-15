import type { OutboxListedRecord } from "@khoralabs/colonnade";
import type { KhoraPost } from "@khoralabs/khora-contracts";
import { decodePostId } from "../lib/post-address-id";
import { fanOutJobId } from "../persistence/core/fan-out-job-id";
import type { FanOutQueuePort } from "../persistence/core/port";

export type FanOutReconcileDeps = {
  tenantKey: string;
  queue: FanOutQueuePort;
  listPrincipals(opts: { afterPrincipalId?: string; limit: number }): string[];
  listOutbox(principalId: string): Promise<readonly OutboxListedRecord[]>;
  resolvePost(postId: string): Promise<KhoraPost | undefined>;
  principalLimit?: number;
  now?: () => number;
};

export type FanOutReconcileResult = {
  principalsScanned: number;
  enqueued: number;
  wrapped: boolean;
};

export async function runFanOutMissingJobReconciliation(
  deps: FanOutReconcileDeps,
): Promise<FanOutReconcileResult> {
  const limit = Math.max(1, deps.principalLimit ?? 32);
  const after = deps.queue.getReconcileAfterPrincipalId();
  let principals = deps.listPrincipals({
    ...(after !== undefined ? { afterPrincipalId: after } : {}),
    limit,
  });
  let wrapped = false;
  if (principals.length === 0 && after !== undefined) {
    principals = deps.listPrincipals({ limit });
    wrapped = true;
  }
  let enqueued = 0;
  let last: string | undefined = after;
  const now = deps.now?.() ?? Date.now();
  for (const principalId of principals) {
    last = principalId;
    const records = await deps.listOutbox(principalId);
    for (const record of records) {
      const postId = postIdFromOutbox(record);
      if (postId === undefined) continue;
      const address = decodePostId(postId);
      if (address === undefined) continue;
      const jobId = fanOutJobId(deps.tenantKey, postId);
      if (deps.queue.getJob(jobId) !== undefined) continue;
      const post = await deps.resolvePost(postId);
      if (post === undefined) continue;
      deps.queue.enqueuePlanning(
        {
          tenantKey: deps.tenantKey,
          postId,
          sourceCellId: address.authorCellId,
          sourceRecordKey: record.record_key,
          sourceContentHash: record.content_hash,
          cellPoolCount: address.cellPoolCount,
          authorPrincipalId: address.authorPrincipalId,
          postKind: post.kind,
          postMetadata: post,
          visibility: post.visibility ?? "public",
          fanOutPolicy: post.fanOutPolicy ?? { mode: "push" },
        },
        now,
      );
      enqueued++;
    }
  }
  deps.queue.setReconcileAfterPrincipalId(principals.length < limit ? undefined : last);
  return { principalsScanned: principals.length, enqueued, wrapped };
}

function postIdFromOutbox(record: OutboxListedRecord): string | undefined {
  const metadata = record.metadata;
  if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata))
    return undefined;
  const postId = (metadata as { postId?: unknown }).postId;
  return typeof postId === "string" && postId.length > 0 ? postId : undefined;
}
