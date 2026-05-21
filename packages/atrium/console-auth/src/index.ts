/**
 * @deprecated Use `@khoralabs/users-auth` instead.
 * This package re-exports the registry auth client and server helpers for backward compatibility.
 */
export {
  createRegistryAuth,
  createUsersAuthClient,
  ensureRegistrySchema as ensureAuthSchema,
  getRegistryAuth as getAuth,
  getRegistryDatabase as getAuthDatabase,
  getRegistrySession as getSession,
  initRegistrySchema as initAuthSchema,
  isRegistryAuthSchemaReady as isAuthSchemaReady,
  normalizeEmail,
  type RegistrySession as AdminSession,
  registryAuth as auth,
  registryDatabasePath as authDatabasePath,
  verifyRegistrySession,
} from "@khoralabs/users-auth";

export { createUsersAuthClient as authClientFactory } from "@khoralabs/users-auth/client";

import { createUsersAuthClient } from "@khoralabs/users-auth/client";

/** @deprecated Use `createUsersAuthClient({ registryUrl })` with your registry URL. */
export const authClient = createUsersAuthClient({
  registryUrl:
    typeof window !== "undefined"
      ? ((import.meta.env.BUN_PUBLIC_KHORA_REGISTRY_URL as string | undefined) ??
        window.location.origin)
      : (process.env.KHORA_REGISTRY_URL ?? "http://localhost:4000"),
});

/** @deprecated Use `REGISTRY_BOOTSTRAP_EMAILS` on the registry service. */
export {
  bootstrapStaffEmails as bootstrapAdminEmails,
  isBootstrapStaffEmail as isBootstrapAdminEmail,
} from "@khoralabs/users-auth";

/** @deprecated Admin authorization is host-console scoped; not used by registry auth. */
export async function requireAdmin(_req: Request): Promise<Response | null> {
  return Response.json({ error: "Forbidden" }, { status: 403 });
}

/** @deprecated Admin authorization is host-console scoped; not used by registry auth. */
export async function canSignInAsAdmin(_email: string): Promise<boolean> {
  return false;
}

/** @deprecated Admin authorization is host-console scoped; not used by registry auth. */
export async function canReceiveAdminOtp(_email: string): Promise<boolean> {
  return false;
}

/** @deprecated Admin authorization is host-console scoped; not used by registry auth. */
export async function findUserRoleByEmail(_email: string): Promise<string | null> {
  return null;
}
