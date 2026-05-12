import type { Migration } from "@khoralabs/sqlite-migrate";

export default {
  from: "0.1.0",
  to: "0.2.0",
  name: "001-add-goals",
  up(db) {
    db.run(`
      CREATE TABLE IF NOT EXISTS goals (
        id TEXT NOT NULL PRIMARY KEY,
        invite_id TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        text TEXT NOT NULL,
        kind TEXT,
        priority INTEGER,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (invite_id) REFERENCES invites(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_goals_invite_id ON goals(invite_id);
      CREATE INDEX IF NOT EXISTS idx_goals_subject_id ON goals(subject_id);
    `);
  },
} satisfies Migration;
