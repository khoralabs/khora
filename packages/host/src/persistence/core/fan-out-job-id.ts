import { createHash } from "node:crypto";

export function fanOutJobId(tenantKey: string, postId: string): string {
  return createHash("sha256").update(tenantKey).update("\0").update(postId).digest("hex");
}
