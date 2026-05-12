import type { Migration } from "@khoralabs/sqlite-migrate";
import { SWARM_HOST_SCHEMA_STATEMENTS } from "../../schema.ts";

export default {
  from: "0.0.0",
  to: "0.1.0",
  name: "001-initial",
  up(db) {
    for (const sql of SWARM_HOST_SCHEMA_STATEMENTS) {
      db.run(sql);
    }
  },
} satisfies Migration;
