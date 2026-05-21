import { readConsoleAuthKind, readConsoleRootToken } from "./env.ts";
import { createRootTokenConsoleAuth } from "./root-token.ts";
import type { ConsoleAuth } from "./types.ts";

export type { ConsoleAuth, ConsolePrincipal } from "./types.ts";
export { createRootTokenConsoleAuth } from "./root-token.ts";
export { readConsoleRootToken, readConsoleAuthKind } from "./env.ts";

/** Returns null when console is disabled (no root token configured). */
export function createConsoleAuthFromEnv(): ConsoleAuth | null {
  const rootToken = readConsoleRootToken();
  if (rootToken === undefined) return null;
  readConsoleAuthKind();
  return createRootTokenConsoleAuth({ rootToken });
}
