import type { Database } from "bun:sqlite";
import type {
  AgentNotification,
  AgentNotificationBufferPort,
  AgentNotificationRow,
  PrincipalId,
} from "@khoralabs/swarm-host";
import { migrateAtriumHostDb } from "./migrate-atrium-host-db.ts";

function parsePayload(kind: string, payloadJson: string): AgentNotification {
  const payload = JSON.parse(payloadJson) as unknown;
  switch (kind) {
    case "negotiation_ticket":
      return { kind: "negotiation_ticket", payload: payload as never };
    case "inbox_post":
      return { kind: "inbox_post", payload: payload as never };
    case "connection_request":
      return { kind: "connection_request", payload };
    case "host":
      return { kind: "host", payload };
    default:
      throw new Error(`unknown notification kind: ${kind}`);
  }
}

function serializeNote(note: AgentNotification): { kind: string; payloadJson: string } {
  switch (note.kind) {
    case "negotiation_ticket":
      return { kind: note.kind, payloadJson: JSON.stringify(note.payload) };
    case "inbox_post":
      return { kind: note.kind, payloadJson: JSON.stringify(note.payload) };
    case "connection_request":
      return { kind: note.kind, payloadJson: JSON.stringify(note.payload) };
    case "host":
      return { kind: note.kind, payloadJson: JSON.stringify(note.payload) };
    default: {
      const _x: never = note;
      return _x;
    }
  }
}

/** SQLite-backed {@link AgentNotificationBufferPort} with durable inbox rows and read receipts. */
export function createSqliteAgentNotificationBuffer(db: Database): AgentNotificationBufferPort {
  migrateAtriumHostDb(db);

  const insertRegistration = db.prepare(
    `INSERT OR IGNORE INTO host_registrations (did, registered_at) VALUES (?, ?)`,
  );

  const insertNote = db.prepare(
    `INSERT INTO agent_notifications (did, created_at, kind, payload_json, read_at_ms)
     VALUES (?, ?, ?, ?, NULL)`,
  );

  const selectUnread = db.prepare(
    `SELECT id, created_at, kind, payload_json, read_at_ms FROM agent_notifications
     WHERE did = ? AND read_at_ms IS NULL ORDER BY created_at ASC LIMIT ?`,
  );

  const selectRecent = db.prepare(
    `SELECT id, created_at, kind, payload_json, read_at_ms FROM agent_notifications
     WHERE did = ? ORDER BY created_at DESC LIMIT ?`,
  );

  const markReadById = db.prepare(
    `UPDATE agent_notifications SET read_at_ms = ? WHERE did = ? AND id = ? AND read_at_ms IS NULL`,
  );
  const markReadCoalesceById = db.prepare(
    `UPDATE agent_notifications SET read_at_ms = COALESCE(read_at_ms, ?) WHERE did = ? AND id = ?`,
  );

  return {
    async ensureRegistered(principalId: PrincipalId): Promise<void> {
      insertRegistration.run(principalId, Date.now());
    },

    async enqueue(principalId: PrincipalId, note: AgentNotification): Promise<number> {
      const { kind, payloadJson } = serializeNote(note);
      insertNote.run(principalId, Date.now(), kind, payloadJson);
      const row = db.query<{ id: number }, []>("SELECT last_insert_rowid() AS id").get();
      if (row?.id === undefined) {
        throw new Error("notification insert: last_insert_rowid missing");
      }
      return row.id;
    },

    async dequeueBatch(principalId: PrincipalId, limit = 32): Promise<AgentNotification[]> {
      const lim = Math.min(Math.max(limit, 1), 256);
      const rows = selectUnread.all(principalId, lim) as Array<{
        id: number;
        created_at: number;
        kind: string;
        payload_json: string;
        read_at_ms: number | null;
      }>;
      if (rows.length === 0) return [];
      const now = Date.now();
      db.transaction(() => {
        for (const r of rows) {
          markReadById.run(now, principalId, r.id);
        }
      })();
      return rows.map((r) => parsePayload(r.kind, r.payload_json));
    },

    async listRecent(principalId: PrincipalId, limit = 50): Promise<AgentNotificationRow[]> {
      const lim = Math.min(Math.max(limit, 1), 500);
      const rows = selectRecent.all(principalId, lim) as Array<{
        id: number;
        created_at: number;
        kind: string;
        payload_json: string;
        read_at_ms: number | null;
      }>;
      return rows.map((r) => ({
        id: r.id,
        createdAtMs: r.created_at,
        readAtMs: r.read_at_ms,
        note: parsePayload(r.kind, r.payload_json),
      }));
    },

    async markRead(principalId: PrincipalId, ids: readonly number[]): Promise<void> {
      if (ids.length === 0) return;
      const now = Date.now();
      db.transaction(() => {
        for (const id of ids) {
          markReadCoalesceById.run(now, principalId, id);
        }
      })();
    },
  };
}
