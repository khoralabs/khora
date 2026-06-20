import { meter } from "../otel.js";

export const turnStartedCounter = meter.createCounter("exedra.turn.started", {
  description: "Interview turns started",
});

export const turnCompletedCounter = meter.createCounter("exedra.turn.completed", {
  description: "Interview turns completed",
});

export const turnDurationHistogram = meter.createHistogram("exedra.turn.duration_ms", {
  description: "Interview turn duration in milliseconds",
  unit: "ms",
});

export type TurnCompletionStatus = "success" | "aborted" | "error";

export function recordTurnStarted(): void {
  turnStartedCounter.add(1);
}

export function recordTurnCompleted(status: TurnCompletionStatus, durationMs: number): void {
  turnCompletedCounter.add(1, { status });
  turnDurationHistogram.record(durationMs, { status });
}
