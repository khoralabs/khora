import { homedir } from "node:os";
import path from "node:path";

import type { FlagMap } from "@khoralabs/cli-kit";
import { strFlag } from "@khoralabs/cli-kit";

import { khoraCliResolvedConfig } from "../khora-app-config.ts";

const DEFAULT_REGISTRY_URL = "http://localhost:4000";

export function cliRegistryUrl(flags: FlagMap): string {
  const cfg = khoraCliResolvedConfig(flags);
  return (
    strFlag(flags, "registry-url") ??
    strFlag(flags, "registryUrl") ??
    cfg.registryUrl ??
    DEFAULT_REGISTRY_URL
  ).replace(/\/$/, "");
}

export function cliRegistryHostSlug(flags: FlagMap): string | undefined {
  const cfg = khoraCliResolvedConfig(flags);
  const fromFlag = strFlag(flags, "host-slug") ?? strFlag(flags, "hostSlug");
  const v = fromFlag ?? cfg.registryHostSlug;
  const trimmed = v?.trim();
  return trimmed !== undefined && trimmed.length > 0 ? trimmed : undefined;
}

export type LinkMetadata = {
  agentDid: string;
  hostBaseUrl: string;
  hostSlug?: string | null;
  linkedAtMs: number;
};

export function linkMetadataPath(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? homedir();
  return path.join(home, ".khora", "link.json");
}
