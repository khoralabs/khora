import type { ConsoleAuth } from "@khoralabs/khora-console";
import type { KhoraHostContext } from "@khoralabs/khora-host";
import type { V2HostRateLimiters } from "../rate-limit-buckets.ts";

export type HostRouteDeps = {
  ctx: KhoraHostContext;
  rateLimiters: V2HostRateLimiters;
  consoleAuth: ConsoleAuth | null;
};
