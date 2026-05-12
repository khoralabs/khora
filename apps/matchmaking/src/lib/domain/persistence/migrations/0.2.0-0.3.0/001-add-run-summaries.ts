import type { Migration } from "@khoralabs/sqlite-migrate";
import { DOMAIN_SCHEMA_RUN_SUMMARIES } from "../../schema.ts";

export default {
  from: "0.2.0",
  to: "0.3.0",
  name: "001-add-run-summaries",
  up(db) {
    db.run(DOMAIN_SCHEMA_RUN_SUMMARIES);
  },
} satisfies Migration;
