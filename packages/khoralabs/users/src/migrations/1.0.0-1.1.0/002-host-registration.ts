import type { Migration } from "@khoralabs/sqlite-migrate";

function hasColumn(db: Parameters<Migration["up"]>[0], table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some((row) => row.name === column);
}

export default {
  from: "1.0.0",
  to: "1.1.0",
  name: "002-host-registration",
  up(db) {
    if (!hasColumn(db, "khora_hosts", "registration_requirements")) {
      db.run(`ALTER TABLE khora_hosts ADD COLUMN registration_requirements TEXT`);
    }
    if (!hasColumn(db, "khora_hosts", "registration_secret_hash")) {
      db.run(`ALTER TABLE khora_hosts ADD COLUMN registration_secret_hash TEXT`);
    }
    if (!hasColumn(db, "khora_hosts", "pending_management_token")) {
      db.run(`ALTER TABLE khora_hosts ADD COLUMN pending_management_token TEXT`);
    }
  },
} satisfies Migration;
