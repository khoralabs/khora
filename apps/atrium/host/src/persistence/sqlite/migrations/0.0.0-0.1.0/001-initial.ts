import type { Migration } from "@khoralabs/sqlite-migrate";
import { AGENT_RELAY_SCHEMA_STATEMENTS } from "../../schema.ts";

export default {
  from: "0.0.0",
  to: "0.1.0",
  name: "001-initial",
  up(db) {
    for (const sql of AGENT_RELAY_SCHEMA_STATEMENTS) {
      db.run(sql);
    }
  },
} satisfies Migration;
