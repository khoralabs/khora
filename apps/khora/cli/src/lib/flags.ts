import type { FlagMap } from "@khoralabs/cli-kit";
import { strFlag } from "@khoralabs/cli-kit";

function trimmedStrFlag(flags: FlagMap, key: string): string | undefined {
  const v = strFlag(flags, key)?.trim();
  return v !== undefined && v.length > 0 ? v : undefined;
}

export function nameFromFlags(flags: FlagMap): string | undefined {
  return trimmedStrFlag(flags, "name");
}

export function queryFromFlags(flags: FlagMap): string | undefined {
  return trimmedStrFlag(flags, "query");
}

export function baseUrlFromFlags(flags: FlagMap): string | undefined {
  return trimmedStrFlag(flags, "base-url");
}

export function hostSlugFromFlags(flags: FlagMap): string | undefined {
  return trimmedStrFlag(flags, "host");
}

export function registryUrlFromFlags(flags: FlagMap): string | undefined {
  return trimmedStrFlag(flags, "registry-url");
}

export function agentKeyPathFromFlags(flags: FlagMap): string | undefined {
  return trimmedStrFlag(flags, "agent-key-path");
}

export function configPathFromFlags(flags: FlagMap): string | undefined {
  return trimmedStrFlag(flags, "config");
}

export function dataDirFromFlags(flags: FlagMap): string | undefined {
  return trimmedStrFlag(flags, "data-dir");
}

export function inviteTokenFromFlags(flags: FlagMap): string | undefined {
  return trimmedStrFlag(flags, "invite-token");
}

export function namespaceRootFromFlags(
  flags: FlagMap,
  defaultRoot = DEFAULT_NAMESPACE_ROOT,
): string {
  return trimmedStrFlag(flags, "namespace-root") ?? defaultRoot;
}

export function minScoreFromFlags(flags: FlagMap): number | undefined {
  const raw = trimmedStrFlag(flags, "min-score");
  if (raw === undefined) return undefined;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    throw new Error("--min-score must be a number between 0 and 1");
  }
  return n;
}

export function registerFieldsFromFlags(flags: FlagMap): {
  username: string;
  displayName: string;
  bio: string;
  inviteToken?: string;
} | null {
  const username = trimmedStrFlag(flags, "username") ?? "";
  const displayName = nameFromFlags(flags) ?? "";
  const bio = trimmedStrFlag(flags, "bio") ?? "";
  if (username.length === 0 || displayName.length === 0 || bio.length === 0) {
    return null;
  }
  const inviteToken = inviteTokenFromFlags(flags);
  return {
    username,
    displayName,
    bio,
    ...(inviteToken !== undefined ? { inviteToken } : {}),
  };
}

export function profilePatchFromFlags(flags: FlagMap): {
  displayName?: string;
  bio?: string;
} | null {
  if (flags.username !== undefined) {
    throw new Error("Username cannot be changed via the CLI. Omit --username.");
  }
  const displayName = nameFromFlags(flags);
  const bio = trimmedStrFlag(flags, "bio");
  const hasBio = bio !== undefined;
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
  const raw = trimmedStrFlag(flags, "top-k");
  if (raw === undefined) return undefined;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("--top-k must be a positive integer");
  }
  return n;
}

export const DEFAULT_NAMESPACE_ROOT = "global";
