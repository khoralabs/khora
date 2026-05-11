import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { AtriumClient, AtriumClientEvent } from "@cfd/atrium-client";

export type InboxBufferClient = Pick<AtriumClient, "subscribe">;

/** All `AtriumClientEvent` variants whose `type` starts with `inbox:` (for indexed eviction). */
export const INBOX_CLIENT_EVENT_TYPES = [
  "inbox:list",
  "inbox:snapshot",
  "inbox:notification",
  "inbox:connection_request",
  "inbox:host",
  "inbox:negotiation_ticket",
  "inbox:topic_post",
  "inbox:probe_hit",
] as const;

export type BufferCompactOpts = {
  maxEntries: number;
  /**
   * Delete rows whose stored `event_type` is in this list. Uses an index — preferred over
   * {@link dropPredicate} for online workloads.
   */
  dropEventTypes?: readonly string[];
  /**
   * Row-by-row scan in primary-key order (bounded batches). Avoid for hot paths; prefer
   * {@link dropEventTypes} when evicting known event kinds.
   */
  dropPredicate?: (event: AtriumClientEvent) => boolean;
};

const PREDICATE_SCAN_BATCH = 512;

function ensureSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS buffered_client_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ingested_at INTEGER NOT NULL,
      event_type TEXT NOT NULL DEFAULT '',
      payload TEXT NOT NULL
    )
  `);
  const cols = db.query<{ name: string }, []>("PRAGMA table_info(buffered_client_events)").all();
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("event_type")) {
    db.run(`ALTER TABLE buffered_client_events ADD COLUMN event_type TEXT NOT NULL DEFAULT ''`);
    db.run(`
      UPDATE buffered_client_events
      SET event_type = COALESCE(json_extract(payload, '$.type'), '')
    `);
  }
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_buffered_client_events_event_type ON buffered_client_events(event_type)`,
  );
}

function deleteByEventTypes(db: Database, types: readonly string[]): void {
  if (types.length === 0) return;
  const placeholders = types.map(() => "?").join(", ");
  db.run(`DELETE FROM buffered_client_events WHERE event_type IN (${placeholders})`, [...types]);
}

function deleteMatchingPredicate(
  db: Database,
  dropPredicate: (event: AtriumClientEvent) => boolean,
): void {
  let lastId = 0;
  for (;;) {
    const rows = db
      .query<{ id: number; payload: string }, [number, number]>(
        `SELECT id, payload FROM buffered_client_events
         WHERE id > ?
         ORDER BY id ASC
         LIMIT ?`,
      )
      .all(lastId, PREDICATE_SCAN_BATCH);
    if (rows.length === 0) break;
    for (const row of rows) {
      lastId = row.id;
      try {
        const ev = JSON.parse(row.payload) as AtriumClientEvent;
        if (dropPredicate(ev)) {
          db.run("DELETE FROM buffered_client_events WHERE id = ?", [row.id]);
        }
      } catch {
        db.run("DELETE FROM buffered_client_events WHERE id = ?", [row.id]);
      }
    }
  }
}

function runCompact(db: Database, opts: BufferCompactOpts): void {
  const { maxEntries, dropEventTypes, dropPredicate } = opts;
  if (dropEventTypes !== undefined && dropEventTypes.length > 0) {
    deleteByEventTypes(db, dropEventTypes);
  }
  if (dropPredicate !== undefined) {
    deleteMatchingPredicate(db, dropPredicate);
  }
  const countRow = db
    .query<{ c: number }, []>("SELECT COUNT(*) AS c FROM buffered_client_events")
    .get();
  const n = countRow?.c ?? 0;
  if (n > maxEntries) {
    const toDrop = n - maxEntries;
    db.run(
      `DELETE FROM buffered_client_events WHERE id IN (
        SELECT id FROM buffered_client_events ORDER BY id ASC LIMIT ?
      )`,
      [toDrop],
    );
  }
}

function eventTypeOf(event: AtriumClientEvent): string {
  return event.type;
}

/**
 * Persist {@link AtriumClientEvent} rows and trim with {@link BufferCompactOpts}: optional indexed
 * {@link BufferCompactOpts.dropEventTypes}, optional {@link BufferCompactOpts.dropPredicate}
 * (batched PK scan), then delete oldest rows until at most `maxEntries` remain.
 */
export function createInboxBuffer(options: {
  client: InboxBufferClient;
  dbPath: string;
  compactAfterAppend?: boolean;
  compactPolicy?: BufferCompactOpts;
}): {
  compact(opts: BufferCompactOpts): void;
  close(): void;
  stats(): { count: number };
} {
  const { client, compactAfterAppend, compactPolicy } = options;
  if (options.dbPath !== ":memory:") {
    mkdirSync(dirname(options.dbPath), { recursive: true });
  }
  const db = new Database(options.dbPath);
  ensureSchema(db);

  const insert = db.query(
    "INSERT INTO buffered_client_events (ingested_at, event_type, payload) VALUES (?, ?, ?)",
  );

  const unsub = client.subscribe((event: AtriumClientEvent) => {
    insert.run(Date.now(), eventTypeOf(event), JSON.stringify(event));
    if (compactAfterAppend === true && compactPolicy !== undefined) {
      runCompact(db, compactPolicy);
    }
  });

  return {
    compact(opts: BufferCompactOpts) {
      runCompact(db, opts);
    },
    close() {
      unsub();
      db.close();
    },
    stats() {
      const row = db
        .query<{ c: number }, []>("SELECT COUNT(*) AS c FROM buffered_client_events")
        .get();
      return { count: row?.c ?? 0 };
    },
  };
}
