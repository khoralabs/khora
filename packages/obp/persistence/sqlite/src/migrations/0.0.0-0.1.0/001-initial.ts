import type { Migration } from "@khoralabs/sqlite-migrate";
import { OBP_SCHEMA_SQL } from "../../schema";

export default {
  from: "0.0.0",
  to: "0.1.0",
  name: "001-initial",
  up(db) {
    db.exec(OBP_SCHEMA_SQL);
  },
} satisfies Migration;
