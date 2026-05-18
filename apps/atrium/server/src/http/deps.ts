import type { At2HostContext } from "@khoralabs/at2-host";
import type { V2HostRateLimiters } from "../rate-limit-buckets.ts";

export type HostRouteDeps = {
  ctx: At2HostContext;
  rateLimiters: V2HostRateLimiters;
};
