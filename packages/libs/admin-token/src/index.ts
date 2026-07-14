import {
  readConsoleAuthKind,
  readConsoleLoginRateLimit,
  readConsoleRootToken,
  readSecureCookies,
} from "./env";
import { createRootTokenConsoleAuth } from "./root-token";
import type { ConsoleAuth } from "./types";

export {
  readConsoleAuthKind,
  readConsoleLoginRateLimit,
  readConsoleRootToken,
  readSecureCookies,
} from "./env";
export { createRootTokenConsoleAuth } from "./root-token";
export type { ConsoleAuth, ConsolePrincipal } from "./types";

/** Returns null when console is disabled (no root token configured). */
export function createConsoleAuthFromEnv(): ConsoleAuth | null {
  const rootToken = readConsoleRootToken();
  if (rootToken === undefined) return null;
  readConsoleAuthKind();
  return createRootTokenConsoleAuth({
    rootToken,
    secureCookies: readSecureCookies(),
    loginRateLimit: readConsoleLoginRateLimit(),
  });
}
