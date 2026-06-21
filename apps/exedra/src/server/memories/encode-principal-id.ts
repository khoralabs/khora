import { createHash } from "node:crypto";

/** Max segment length so org/user team + session paths stay within memories' 128-char namespace limit. */
export const MEMORY_PRINCIPAL_SEGMENT_LENGTH = 22;

/** Encode a principal id (e.g. did:key) for memories namespace segments and filenames. */
export function encodePrincipalIdForMemories(principalId: string): string {
  return createHash("sha256")
    .update(principalId, "utf8")
    .digest("base64url")
    .slice(0, MEMORY_PRINCIPAL_SEGMENT_LENGTH)
    .toLowerCase();
}
