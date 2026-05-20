import { authDatabasePath, getAuthDatabase } from "../src/db.ts";
import { initAuthSchema } from "../src/schema.ts";

console.log(`Database: ${authDatabasePath()}`);
await initAuthSchema(getAuthDatabase());
console.log("[atrium-console-auth] Auth schema ready.");
