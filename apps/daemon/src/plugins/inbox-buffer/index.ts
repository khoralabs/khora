import { Database } from "bun:sqlite";
import {
  isDerivedInboxKindEvent,
  type KhoraAppPluginMap,
  type KhoraPluginInstaller,
} from "@khoralabs/khora-client";
import type { KhoraClientEvent } from "@khoralabs/khora-client/transport";

type InboxBufferOptions = Extract<
  NonNullable<KhoraAppPluginMap["khora.plugin.inbox-buffer"]>,
  Record<string, unknown>
>;

export function createInboxBufferPlugin(options: InboxBufferOptions): KhoraPluginInstaller {
  return (ctx) => {
    const dbPath = ctx.resolvePath(options.dbPath);
    const db = new Database(dbPath);
    db.run(`
      CREATE TABLE IF NOT EXISTS inbox_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at_ms INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL
      )
    `);
    db.run(`CREATE INDEX IF NOT EXISTS idx_inbox_events_type ON inbox_events(event_type)`);

    const unsub = ctx.client.subscribe((event) => {
      if (!event.type.startsWith("inbox:")) return;
      if (isDerivedInboxKindEvent(event)) return;
      appendEvent(db, event);
      if (options.compactAfterAppend === true) {
        compact(db, options.compactPolicy);
      }
    });

    return {
      stop() {
        unsub();
        db.close();
      },
    };
  };
}

function appendEvent(db: Database, event: KhoraClientEvent): void {
  db.run(`INSERT INTO inbox_events (created_at_ms, event_type, payload) VALUES (?, ?, ?)`, [
    Date.now(),
    event.type,
    JSON.stringify(event),
  ]);
}

function compact(db: Database, policy: InboxBufferOptions["compactPolicy"]): void {
  if (policy === undefined) return;
  const max = policy.maxEntries;
  const count = db.query("SELECT COUNT(*) AS c FROM inbox_events").get() as { c: number };
  if (count.c <= max) return;

  const dropTypes = policy.dropEventTypes;
  if (dropTypes !== undefined && dropTypes.length > 0) {
    for (const t of dropTypes) {
      db.run(`DELETE FROM inbox_events WHERE event_type = ?`, [t]);
    }
    const after = db.query("SELECT COUNT(*) AS c FROM inbox_events").get() as { c: number };
    if (after.c <= max) return;
  }

  const excess = count.c - max;
  db.run(
    `DELETE FROM inbox_events WHERE id IN (
      SELECT id FROM inbox_events ORDER BY id ASC LIMIT ?
    )`,
    [excess],
  );
}
