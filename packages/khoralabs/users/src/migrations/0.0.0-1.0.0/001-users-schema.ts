import type { Migration } from "@khoralabs/sqlite-migrate";
import { USERS_SCHEMA_SQL } from "../../schema-sql";

export default {
  from: "0.0.0",
  to: "1.0.0",
  name: "001-users-schema",
  up(db) {
    db.run(USERS_SCHEMA_SQL);
  },
} satisfies Migration;
