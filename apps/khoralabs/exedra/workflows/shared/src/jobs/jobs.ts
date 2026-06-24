/** Job kinds tracked in exedra.db `jobs` table. */
export type JobKind = "workflow";

export type JobStatus = "pending" | "running" | "done" | "failed" | "cancelled";

/** Wire events appended to `job_events` and streamed over SSE. */
export type JobEvent = { type: "status"; status: JobStatus } | { type: "error"; error: string };

export type JobEventRecord = {
  seq: number;
  event: JobEvent;
  createdAtMs: number;
};

export type JobRecord = {
  id: string;
  kind: JobKind;
  status: JobStatus;
  payload: unknown;
  ownerUserId: string | null;
  taskRunId: string | null;
  result: unknown | null;
  createdAtMs: number;
  updatedAtMs: number;
  error: string | null;
};

export type CreateJobInput = {
  id?: string;
  kind: JobKind;
  payload: unknown;
  ownerUserId: string;
  status?: JobStatus;
};

export type AppendJobEventsRequest = {
  events: JobEvent[];
};

export type CompleteJobRequest = {
  result?: unknown;
  events?: JobEvent[];
};

export type FailJobRequest = {
  error: string;
  events?: JobEvent[];
};
