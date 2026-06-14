import type { Database } from "bun:sqlite";
import type { UIMessage } from "ai";

import { jsonbParam, parseJsonColumn } from "./jsonb";

type MessageRow = {
  id: string;
  role: UIMessage["role"];
  parts: string;
  metadata: string | null;
  message_index: number;
};

export function nextMessageIndex(db: Database, threadId: string): number {
  const row = db
    .query<{ max_index: number | null }, [string]>(
      `SELECT MAX(message_index) AS max_index FROM messages WHERE thread_id = ?`,
    )
    .get(threadId);
  const max = row?.max_index;
  return max === null || max === undefined ? 0 : max + 1;
}

export function insertMessage(
  db: Database,
  params: {
    id: string;
    threadId: string;
    role: UIMessage["role"];
    parts: UIMessage["parts"];
    metadata?: UIMessage["metadata"];
    messageIndex: number;
    createdAtMs?: number;
  },
): void {
  const createdAtMs = params.createdAtMs ?? Date.now();
  const metadataJson = params.metadata !== undefined ? jsonbParam(params.metadata) : null;

  if (metadataJson === null) {
    db.prepare(
      `INSERT INTO messages (id, thread_id, role, parts, metadata, message_index, created_at_ms)
       VALUES (?, ?, ?, jsonb(?), NULL, ?, ?)`,
    ).run(
      params.id,
      params.threadId,
      params.role,
      jsonbParam(params.parts),
      params.messageIndex,
      createdAtMs,
    );
    return;
  }

  db.prepare(
    `INSERT INTO messages (id, thread_id, role, parts, metadata, message_index, created_at_ms)
     VALUES (?, ?, ?, jsonb(?), jsonb(?), ?, ?)`,
  ).run(
    params.id,
    params.threadId,
    params.role,
    jsonbParam(params.parts),
    metadataJson,
    params.messageIndex,
    createdAtMs,
  );
}

export function loadThreadMessages(db: Database, threadId: string): UIMessage[] {
  const rows = db
    .query<MessageRow, [string]>(
      `SELECT id, role, json(parts) AS parts, json(metadata) AS metadata, message_index
       FROM messages
       WHERE thread_id = ?
       ORDER BY message_index ASC`,
    )
    .all(threadId);

  return rows.map((row) => {
    const parts = parseJsonColumn<UIMessage["parts"]>(row.parts);
    if (parts === undefined) {
      throw new Error(`message ${row.id} has invalid parts JSON`);
    }
    const metadata = parseJsonColumn<UIMessage["metadata"]>(row.metadata);
    return {
      id: row.id,
      role: row.role,
      parts,
      ...(metadata !== undefined ? { metadata } : {}),
    };
  });
}
