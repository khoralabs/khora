import type { Migration } from "@khoralabs/sqlite-migrate";

export default {
  from: "0.1.0",
  to: "0.2.0",
  name: "001-subjects",
  up(db) {
    db.run(`CREATE TABLE IF NOT EXISTS agent_subscriptions (
      did TEXT NOT NULL,
      subject TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (did, subject)
    )`);
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_agent_subscriptions_subject ON agent_subscriptions(subject)`,
    );

    const legacy = db
      .query<{ name: string }, []>(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'topic_subscriptions'`,
      )
      .get();
    if (legacy !== undefined) {
      db.run(`INSERT OR IGNORE INTO agent_subscriptions (did, subject, created_at)
        SELECT did, 'topic:' || topic_slug, created_at FROM topic_subscriptions`);
      db.run(`DROP TABLE topic_subscriptions`);
    }

    db.run(`DELETE FROM agent_notifications WHERE kind IN ('topic_post', 'probe_hit')`);
  },
} satisfies Migration;
