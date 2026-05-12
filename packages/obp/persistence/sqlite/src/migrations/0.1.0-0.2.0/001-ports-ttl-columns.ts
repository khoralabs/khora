import type { Migration } from "@khoralabs/sqlite-migrate";

export default {
  from: "0.1.0",
  to: "0.2.0",
  name: "001-ports-ttl-columns",
  up(db) {
    const cols = db.query<{ name: string }, []>("PRAGMA table_info(obp_ports)").all();
    const names = new Set(cols.map((c) => c.name));
    if (!names.has("ttl_basis")) {
      db.run("ALTER TABLE obp_ports ADD COLUMN ttl_basis TEXT");
    }
    if (!names.has("ttl_measure")) {
      db.run("ALTER TABLE obp_ports ADD COLUMN ttl_measure INTEGER");
    }
    if (!names.has("expose_seq")) {
      db.run("ALTER TABLE obp_ports ADD COLUMN expose_seq INTEGER");
    }
    if (!names.has("bind_policy_json")) {
      db.run("ALTER TABLE obp_ports ADD COLUMN bind_policy_json TEXT");
    }
  },
} satisfies Migration;
