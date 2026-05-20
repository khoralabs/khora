import "../src/load-env.ts";
import { authDatabasePath, ensureAuthSchema } from "@khoralabs/atrium-console-auth";

console.log("Database:", authDatabasePath());
await ensureAuthSchema();
console.log("Auth schema ready.");
