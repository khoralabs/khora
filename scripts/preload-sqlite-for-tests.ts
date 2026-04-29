/**
 * Ensures Bun uses a libsqlite3 with extension loading before any test opens `bun:sqlite`.
 * Otherwise earlier tests (e.g. direct `new Database(":memory:")`) load bundled SQLite and
 * `Database.setCustomSQLite` fails with "SQLite already loaded".
 */
import { ensureCustomSqliteForExtensions } from "../packages/memories/persistence/sqlite/src/connection.ts";

ensureCustomSqliteForExtensions();
