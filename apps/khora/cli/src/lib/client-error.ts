import type { FlagMap } from "@khoralabs/cli-kit";
import { formatThrownError, KhoraClientError } from "@khoralabs/khora-transport";

import { cliBaseUrl } from "../flows/context";

/** Print a host HTTP error and exit; rethrows anything else. */
export function exitOnClientError(e: unknown, flags: FlagMap): never {
  if (e instanceof KhoraClientError) {
    console.error(`Host request failed (${e.status}): ${formatThrownError(e)}`);
    console.error(`base-url: ${cliBaseUrl(flags)}`);
    process.exit(1);
  }
  throw e;
}
