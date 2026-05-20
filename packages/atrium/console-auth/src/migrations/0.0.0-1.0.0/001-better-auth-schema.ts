import type { Migration } from "@khoralabs/sqlite-migrate";
import { getMigrations } from "better-auth/db/migration";
import { createAuthInstance } from "../../auth-config.ts";

/** Applies Better Auth core + plugin tables via the library migrator (bun:sqlite). */
export default {
  from: "0.0.0",
  to: "1.0.0",
  name: "001-better-auth-schema",
  async up(_db) {
    const auth = createAuthInstance();
    const { toBeAdded, toBeCreated, runMigrations } = await getMigrations(auth.options);
    if (toBeAdded.length === 0 && toBeCreated.length === 0) return;
    await runMigrations();
  },
} satisfies Migration;
