import type { Migration } from "@khoralabs/sqlite-migrate";
import { DOMAIN_SCHEMA_V1 } from "../../schema.ts";

export default {
  from: "0.0.0",
  to: "0.1.0",
  name: "001-initial",
  up(db) {
    db.run(DOMAIN_SCHEMA_V1);
  },
} satisfies Migration;
