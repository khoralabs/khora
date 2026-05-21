import { createHash } from "node:crypto";

export function hashInviteToken(pepper: string, plaintext: string): string {
  return createHash("sha256")
    .update(pepper, "utf8")
    .update("\0", "utf8")
    .update(plaintext, "utf8")
    .digest("hex");
}
