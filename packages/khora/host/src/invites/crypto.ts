import { createHash, randomBytes } from "node:crypto";

export function hashInviteToken(pepper: string, plaintext: string): string {
  return createHash("sha256")
    .update(pepper, "utf8")
    .update("\0", "utf8")
    .update(plaintext, "utf8")
    .digest("hex");
}

export function generateInvitePlaintext(): string {
  return randomBytes(24).toString("base64url");
}
