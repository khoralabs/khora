import type { Migration } from "@khoralabs/sqlite-migrate";

export default {
  from: "0.1.0",
  to: "0.2.0",
  name: "002-binds-counterparty-columns",
  up(db) {
    const cols = db.query<{ name: string }, []>("PRAGMA table_info(obp_binds)").all();
    const names = new Set(cols.map((c) => c.name));
    if (!names.has("counterparty_bind_json")) {
      db.run("ALTER TABLE obp_binds ADD COLUMN counterparty_bind_json TEXT");
    }
    if (!names.has("bind_policy_json")) {
      db.run("ALTER TABLE obp_binds ADD COLUMN bind_policy_json TEXT");
    }
    if (!names.has("content_receipts_json")) {
      db.run("ALTER TABLE obp_binds ADD COLUMN content_receipts_json TEXT NOT NULL DEFAULT '[]'");
    }
  },
} satisfies Migration;
