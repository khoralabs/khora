import type { FanOutWorkerEvent } from "./workers";

export type FanOutMetricRecorder = {
  count(name: string, value: number, attrs?: Record<string, string>): void;
  duration(name: string, ms: number, attrs?: Record<string, string>): void;
  gauge(name: string, value: number, attrs?: Record<string, string>): void;
};

export type FanOutRouteBatchEvent = {
  targets: number;
  active: number;
  durationMs: number;
  outcome: "success" | "failure";
  partitions?: number;
};

export function createMemoryFanOutMetrics(): {
  recorder: FanOutMetricRecorder;
  values: Map<string, number>;
} {
  const values = new Map<string, number>();
  const bump = (name: string, value: number) => {
    values.set(name, (values.get(name) ?? 0) + value);
  };
  return {
    values,
    recorder: {
      count: bump,
      duration: bump,
      gauge: (name, value) => {
        values.set(name, value);
      },
    },
  };
}

export function recordFanOutWorkerEvent(
  recorder: FanOutMetricRecorder,
  event: FanOutWorkerEvent,
): void {
  if (event.type === "planning") {
    recorder.count("khora.fanout.planning", 1, {
      outcome: event.outcome,
      policy: event.policyMode,
    });
    recorder.duration("khora.fanout.planning.duration_ms", event.durationMs);
    recorder.gauge("khora.fanout.queue.lag_ms", event.queueLagMs);
    recorder.gauge("khora.fanout.queue.depth", event.queueDepth);
    if (event.targets !== undefined) recorder.count("khora.fanout.targets.planned", event.targets);
    if (event.deliveryMode !== undefined) {
      recorder.count("khora.fanout.delivery_mode", 1, { mode: event.deliveryMode });
    }
    if (event.retry) recorder.count("khora.fanout.retries", 1, { stage: "planning" });
    if (event.leaseRecovered)
      recorder.count("khora.fanout.lease_recovery", 1, { stage: "planning" });
  } else if (event.type === "delivery") {
    recorder.count("khora.fanout.delivery", 1, { outcome: event.outcome });
    recorder.duration("khora.fanout.delivery.duration_ms", event.durationMs);
    recorder.gauge("khora.fanout.queue.lag_ms", event.queueLagMs);
    recorder.gauge("khora.fanout.queue.depth", event.queueDepth);
    recorder.count("khora.fanout.targets.routed", event.targets);
    if (event.delivered !== undefined) recorder.count("khora.fanout.delivered", event.delivered);
    if (event.failed !== undefined) recorder.count("khora.fanout.failed", event.failed);
    if (event.retry) recorder.count("khora.fanout.retries", 1, { stage: "delivery" });
    if (event.leaseRecovered)
      recorder.count("khora.fanout.lease_recovery", 1, { stage: "delivery" });
  } else {
    recorder.count("khora.fanout.receipt", 1, { available: event.available ? "true" : "false" });
    recorder.duration("khora.fanout.receipt.duration_ms", event.durationMs);
    if (event.fragmentBytes !== undefined) {
      recorder.count("khora.fanout.receipt.fragment_bytes", event.fragmentBytes);
    }
    if (event.fragmentCount !== undefined) {
      recorder.count("khora.fanout.receipt.fragments", event.fragmentCount);
    }
    if (event.targetCardinality !== undefined) {
      recorder.gauge("khora.fanout.receipt.target_cardinality", event.targetCardinality);
    }
    if (!event.available) recorder.count("khora.fanout.receipt.failures", 1);
  }
}

export function recordFanOutRouteBatch(
  recorder: FanOutMetricRecorder,
  event: FanOutRouteBatchEvent,
): void {
  recorder.count("khora.fanout.route.batches", 1, { outcome: event.outcome });
  recorder.count("khora.fanout.route.targets", event.targets);
  recorder.duration("khora.fanout.route.duration_ms", event.durationMs);
  recorder.gauge("khora.fanout.route.concurrency", event.active);
  if (event.partitions !== undefined) {
    recorder.gauge("khora.fanout.route.open_partitions", event.partitions);
  }
}
