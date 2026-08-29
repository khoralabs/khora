import { homedir } from "node:os";
import path from "node:path";

import type { FlagMap } from "@khoralabs/cli-kit";

import { khoraCliResolvedConfig } from "../khora-app-config";
import { registryUrlFromFlags } from "../lib/flags";
import { defaultRegistryUrl } from "./default-registry-url";

export function cliRegistryUrl(flags: FlagMap): string {
  const cfg = khoraCliResolvedConfig(flags);
  return (registryUrlFromFlags(flags) ?? cfg.registryUrl ?? defaultRegistryUrl()).replace(
    /\/$/,
    "",
  );
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
