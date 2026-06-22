/** Job kinds tracked in exedra.db `jobs` table. */
export type JobKind = "memory_investigation" | "interview_turn" | "facilitation_event";

export type JobStatus = "pending" | "running" | "done" | "failed" | "cancelled";

export type InvestigatorCitationWire = {
  memory_key: string;
  rationale?: string;
};

export type InvestigatorAnswerWire = {
  answer: string;
  citations?: InvestigatorCitationWire[];
  follow_up_queries?: string[];
};

export type MemoryInvestigationJobPayload = {
  namespace: string;
  question: string;
  maxSteps: number;
  userId: string;
  orgId?: string;
};

/** Wire events appended to `job_events` and streamed over SSE. */
export type JobEvent =
  | { type: "status"; status: JobStatus }
  | { type: "error"; error: string }
  | { type: "investigation_step"; step: number; message: string }
  | { type: "investigation_complete"; answer: InvestigatorAnswerWire }
  | { type: "turn_event"; event: TurnEventWire };

/** JSON-serializable interview turn events relayed to WebSocket clients. */
export type TurnEventWire =
  | {
      type: "text_delta";
      turnId: string;
      delta: string;
    }
  | { type: "tool_call"; turnId: string; toolCallId: string; toolName: string; input: unknown }
  | { type: "tool_result"; turnId: string; toolCallId: string; toolName: string; output: unknown }
  | { type: "tool_error"; turnId: string; toolCallId: string; toolName: string; errorText: string }
  | { type: "belief_flag"; turnId: string; belief: string; sourceMessageId: string }
  | { type: "turn_aborted"; turnId: string }
  | { type: "turn_failed"; turnId: string; error: string }
  | { type: "error"; error: string };

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
