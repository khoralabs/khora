import { createAuthInstance } from "./src/auth-config.ts";

/** Used by `bunx auth migrate` — must export `auth` from package root. */
export const auth = createAuthInstance();
