/** Encode a principal id (e.g. did:key) for memories namespace segments and filenames. */
export function encodePrincipalIdForMemories(principalId: string): string {
  return Buffer.from(principalId, "utf8").toString("base64url").toLowerCase();
}
