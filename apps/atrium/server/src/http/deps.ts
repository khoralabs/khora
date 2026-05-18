import type { AtriumHostContext } from "@khoralabs/atrium-host";
import type { V2HostRateLimiters } from "../rate-limit-buckets.ts";

export type HostRouteDeps = {
  ctx: AtriumHostContext;
  rateLimiters: V2HostRateLimiters;
};
