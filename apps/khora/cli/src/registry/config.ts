import { homedir } from "node:os";
import path from "node:path";

import type { FlagMap } from "@khoralabs/cli-kit";
import { strFlag } from "@khoralabs/cli-kit";

import { khoraCliResolvedConfig } from "../khora-app-config";
import { defaultRegistryUrl } from "./default-registry-url";

export function cliRegistryUrl(flags: FlagMap): string {
  const cfg = khoraCliResolvedConfig(flags);
  return (
    strFlag(flags, "registry-url") ??
    strFlag(flags, "registryUrl") ??
    cfg.registryUrl ??
    defaultRegistryUrl()
  ).replace(/\/$/, "");
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
