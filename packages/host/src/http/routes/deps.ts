import type { AdminTokenAuth } from "@khoralabs/khora-auth";
import type { KhoraHostContext } from "../..";
import type { V2HostRateLimiters } from "../rate-limit-buckets";

export type HostRouteDeps = {
  ctx: KhoraHostContext;
  rateLimiters: V2HostRateLimiters;
  adminTokenAuth: AdminTokenAuth | null;
};
