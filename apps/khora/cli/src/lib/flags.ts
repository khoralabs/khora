import type { FlagMap } from "@khoralabs/cli-kit";
import { strFlag } from "@khoralabs/cli-kit";

export function displayNameFromFlags(flags: FlagMap): string | undefined {
  const v =
    strFlag(flags, "name") ?? strFlag(flags, "display-name") ?? strFlag(flags, "displayName");
  const t = v?.trim();
  return t !== undefined && t.length > 0 ? t : undefined;
}

export function registerFieldsFromFlags(flags: FlagMap): {
  username: string;
  displayName: string;
  bio: string;
  inviteToken?: string;
} | null {
  const username = strFlag(flags, "username")?.trim() ?? "";
  const displayName = displayNameFromFlags(flags) ?? "";
  const bio = strFlag(flags, "bio")?.trim() ?? "";
  if (username.length === 0 || displayName.length === 0 || bio.length === 0) {
    return null;
  }
  const inviteToken = strFlag(flags, "invite-token") ?? strFlag(flags, "inviteToken");
  return {
    username,
    displayName,
    bio,
    ...(inviteToken !== undefined && inviteToken.trim().length > 0
      ? { inviteToken: inviteToken.trim() }
      : {}),
  };
}

export function profilePatchFromFlags(flags: FlagMap): {
  displayName?: string;
  bio?: string;
} | null {
  if (flags.username !== undefined) {
    throw new Error("Username cannot be changed via the CLI. Omit --username.");
  }
  const displayName = displayNameFromFlags(flags);
  const bioRaw = strFlag(flags, "bio");
  const bio = bioRaw?.trim();
  const hasBio = bio !== undefined && bio.length > 0;
  const hasName = displayName !== undefined;
  if (!hasName && !hasBio) {
    return null;
  }
  return {
    ...(hasName ? { displayName } : {}),
    ...(hasBio ? { bio } : {}),
  };
}

export function parseTopK(flags: FlagMap): number | undefined {
  const raw = strFlag(flags, "top-k") ?? strFlag(flags, "topK");
  if (raw === undefined) return undefined;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("--top-k must be a positive integer");
  }
  return n;
}

export const DEFAULT_NAMESPACE_ROOT = "global";
