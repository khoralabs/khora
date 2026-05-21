/**
 * @deprecated Use `@khoralabs/users-auth/client` and `createUsersAuthClient({ registryUrl })`.
 */
export { createUsersAuthClient } from "@khoralabs/users-auth/client";

import { createUsersAuthClient } from "@khoralabs/users-auth/client";

/** @deprecated Use `createUsersAuthClient({ registryUrl })`. */
export const authClient = createUsersAuthClient({
  registryUrl:
    typeof window !== "undefined"
      ? ((import.meta.env.BUN_PUBLIC_KHORA_REGISTRY_URL as string | undefined) ??
        window.location.origin)
      : (process.env.KHORA_REGISTRY_URL ?? "http://localhost:4000"),
});
