import { describe, expect, test } from "bun:test";
import {
  createMemoryFanOutMetrics,
  recordFanOutRouteBatch,
  recordFanOutWorkerEvent,
} from "./metrics";

test("records queue, delivery, receipt, and hybrid policy metrics", () => {
  const { recorder, values } = createMemoryFanOutMetrics();
  recordFanOutWorkerEvent(recorder, {
    type: "planning",
    outcome: "success",
    jobId: "job",
    attempt: 1,
    queueLagMs: 12,
    queueDepth: 3,
    leaseRecovered: false,
    durationMs: 4,
    policyMode: "hybrid",
    targets: 10,
    deliveryMode: "pull",
  });
  recordFanOutWorkerEvent(recorder, {
    type: "delivery",
    outcome: "success",
    jobId: "job",
    chunkIndex: 0,
    attempt: 2,
    queueLagMs: 1,
    queueDepth: 1,
    leaseRecovered: true,
    durationMs: 8,
    targets: 4,
    delivered: 3,
    failed: 1,
  });
  recordFanOutWorkerEvent(recorder, {
    type: "receipt",
    jobId: "job",
    available: false,
    durationMs: 2,
    fragmentBytes: 0,
    fragmentCount: 0,
    targetCardinality: 0,
    error: "missing",
  });
  recordFanOutRouteBatch(recorder, {
    targets: 4,
    active: 2,
    durationMs: 5,
    outcome: "success",
    partitions: 7,
  });
  expect(values.get("khora.fanout.targets.planned")).toBe(10);
  expect(values.get("khora.fanout.delivered")).toBe(3);
  expect(values.get("khora.fanout.failed")).toBe(1);
  expect(values.get("khora.fanout.receipt.failures")).toBe(1);
  expect(values.get("khora.fanout.lease_recovery")).toBe(1);
  expect(values.get("khora.fanout.route.open_partitions")).toBe(7);
  expect(values.get("khora.fanout.queue.depth")).toBe(1);
});

describe("metric names stay operational", () => {
  test("catalog-pull decisions are counted", () => {
    const { recorder, values } = createMemoryFanOutMetrics();
    recordFanOutWorkerEvent(recorder, {
      type: "planning",
      outcome: "success",
      jobId: "job",
      attempt: 1,
      queueLagMs: 0,
      queueDepth: 0,
      leaseRecovered: false,
      durationMs: 1,
      policyMode: "catalog-pull",
      deliveryMode: "pull",
    });
    expect(values.get("khora.fanout.planning")).toBe(1);
    expect(values.get("khora.fanout.delivery_mode")).toBe(1);
  });
});
