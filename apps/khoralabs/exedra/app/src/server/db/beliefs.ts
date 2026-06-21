import type { Database } from "bun:sqlite";

export type BeliefFeedbackRecord = {
  id: string;
  sourceMessageId: string;
  feedback: "confirmed" | "corrected";
  correction: string | null;
  updatedAtMs: number;
};

type BeliefFeedbackRow = {
  belief_id: string;
  source_message_id: string;
  feedback: "confirmed" | "corrected";
  correction: string | null;
  updated_at_ms: number;
};

function mapRow(row: BeliefFeedbackRow): BeliefFeedbackRecord {
  return {
    id: row.belief_id,
    sourceMessageId: row.source_message_id,
    feedback: row.feedback,
    correction: row.correction,
    updatedAtMs: row.updated_at_ms,
  };
}

export function loadBeliefFeedback(db: Database, threadId: string): BeliefFeedbackRecord[] {
  const rows = db
    .query<BeliefFeedbackRow, [string]>(
      `SELECT belief_id, source_message_id, feedback, correction, updated_at_ms
       FROM belief_feedback
       WHERE thread_id = ?
       ORDER BY updated_at_ms ASC`,
    )
    .all(threadId);
  return rows.map(mapRow);
}

export function upsertBeliefFeedback(
  db: Database,
  params: {
    threadId: string;
    beliefId: string;
    sourceMessageId: string;
    feedback: "confirmed" | "corrected";
    correction?: string | null;
  },
): BeliefFeedbackRecord {
  const updatedAtMs = Date.now();
  const correction =
    params.feedback === "corrected" ? (params.correction?.trim() ?? "") || null : null;

  db.prepare(
    `INSERT INTO belief_feedback (
       thread_id, belief_id, source_message_id, feedback, correction, updated_at_ms
     ) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(thread_id, belief_id) DO UPDATE SET
       source_message_id = excluded.source_message_id,
       feedback = excluded.feedback,
       correction = excluded.correction,
       updated_at_ms = excluded.updated_at_ms`,
  ).run(
    params.threadId,
    params.beliefId,
    params.sourceMessageId,
    params.feedback,
    correction,
    updatedAtMs,
  );

  const row = db
    .query<BeliefFeedbackRow, [string, string]>(
      `SELECT belief_id, source_message_id, feedback, correction, updated_at_ms
       FROM belief_feedback
       WHERE thread_id = ? AND belief_id = ?
       LIMIT 1`,
    )
    .get(params.threadId, params.beliefId);

  if (row === null) throw new Error("belief feedback upsert failed");
  return mapRow(row);
}
