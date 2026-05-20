export { auth } from "./auth.ts";
export { authClient } from "./client.ts";
export { normalizeEmail, isBootstrapAdminEmail, bootstrapAdminEmails } from "./allowlist.ts";
export { authDatabasePath, getAuthDatabase } from "./db.ts";
export { ensureAuthSchema, isAuthSchemaReady } from "./ensure-schema.ts";
export { initAuthSchema } from "./schema.ts";
export { getSession, requireAdmin, type AdminSession } from "./session.ts";
export { canSignInAsAdmin, canReceiveAdminOtp, findUserRoleByEmail } from "./users.ts";
