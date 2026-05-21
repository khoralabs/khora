import { readConsoleAuthKind, readConsoleRootToken } from "./env.ts";
import { createRootTokenConsoleAuth } from "./root-token.ts";
import type { ConsoleAuth } from "./types.ts";

export { readConsoleAuthKind, readConsoleRootToken } from "./env.ts";
export { createRootTokenConsoleAuth } from "./root-token.ts";
export type { ConsoleAuth, ConsolePrincipal } from "./types.ts";

/** Returns null when console is disabled (no root token configured). */
export function createConsoleAuthFromEnv(): ConsoleAuth | null {
  const rootToken = readConsoleRootToken();
  if (rootToken === undefined) return null;
  readConsoleAuthKind();
  return createRootTokenConsoleAuth({ rootToken });
}
