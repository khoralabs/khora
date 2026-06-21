import type { Database } from "bun:sqlite";
import type { UIMessage } from "ai";

import { jsonbParam, parseJsonColumn } from "./jsonb";

export type StoredMessage = UIMessage & {
  createdAtMs: number;
  authorDid: string;
};

type MessageRow = {
  id: string;
  role: UIMessage["role"];
  author_did: string;
  parts: string;
  metadata: string | null;
  message_index: number;
  created_at_ms: number;
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
    authorDid: string;
    createdAtMs?: number;
  },
): number {
  const createdAtMs = params.createdAtMs ?? Date.now();
  const metadataJson = params.metadata !== undefined ? jsonbParam(params.metadata) : null;

  if (metadataJson === null) {
    db.prepare(
      `INSERT INTO messages (id, thread_id, role, author_did, parts, metadata, message_index, created_at_ms)
       VALUES (?, ?, ?, ?, jsonb(?), NULL, ?, ?)`,
    ).run(
      params.id,
      params.threadId,
      params.role,
      params.authorDid,
      jsonbParam(params.parts),
      params.messageIndex,
      createdAtMs,
    );
    return createdAtMs;
  }

  db.prepare(
    `INSERT INTO messages (id, thread_id, role, author_did, parts, metadata, message_index, created_at_ms)
     VALUES (?, ?, ?, ?, jsonb(?), jsonb(?), ?, ?)`,
  ).run(
    params.id,
    params.threadId,
    params.role,
    params.authorDid,
    jsonbParam(params.parts),
    metadataJson,
    params.messageIndex,
    createdAtMs,
  );
  return createdAtMs;
}

export function loadThreadMessages(
  db: Database,
  threadId: string,
  limit?: number,
): StoredMessage[] {
  const rows = db
    .query<MessageRow, [string]>(
      limit !== undefined
        ? `SELECT id, role, author_did, json(parts) AS parts, json(metadata) AS metadata, message_index, created_at_ms
           FROM messages
           WHERE thread_id = ?
           ORDER BY message_index DESC
           LIMIT ${limit}`
        : `SELECT id, role, author_did, json(parts) AS parts, json(metadata) AS metadata, message_index, created_at_ms
           FROM messages
           WHERE thread_id = ?
           ORDER BY message_index ASC`,
    )
    .all(threadId);

  if (limit !== undefined) rows.reverse();

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
      createdAtMs: row.created_at_ms,
      authorDid: row.author_did,
      ...(metadata !== undefined ? { metadata } : {}),
    };
  });
}
