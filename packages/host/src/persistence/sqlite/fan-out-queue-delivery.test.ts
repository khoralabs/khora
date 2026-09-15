import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { createSqliteFanOutQueue } from "./fan-out-queue";

test("delivery claim and completion decode only the selected chunk", () => {
  const db = new Database(":memory:");
  const queue = createSqliteFanOutQueue(db);
  const jobId = queue.enqueuePlanning(
    {
      tenantKey: "tenant",
      postId: "post",
      sourceCellId: "cell",
      sourceRecordKey: "record",
      sourceContentHash: "a".repeat(64),
      cellPoolCount: 1,
      authorPrincipalId: "author",
      postKind: "post",
      postMetadata: {},
      visibility: "public",
      fanOutPolicy: { mode: "push" },
    },
    0,
  );
  queue.tryClaimPlanning(0, 10);
  queue.appendWorkloadChunk(jobId, [{ ordinal: 1, subscriptionMatches: [] }], 0);
  queue.appendWorkloadChunk(jobId, [{ ordinal: 2, subscriptionMatches: [] }], 1);
  queue.completePlanning(jobId, 2, 1);
  db.query(`UPDATE fan_out_workload_chunks SET workload_gzip=x'00'
    WHERE job_id=? AND chunk_index=1`).run(jobId);

  const claimed = queue.tryClaimDelivery(1, 10);
  expect(claimed?.chunkIndex).toBe(0);
  queue.completeDelivery(jobId, 0, [1], [], 2);
  expect(queue.getJob(jobId)).toMatchObject({ status: "routing_pending", routedTargetCount: 1 });
});
