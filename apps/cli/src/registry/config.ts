import type { FlagMap } from "@khoralabs/cli-kit";
import { defaultRegistryUrl } from "@khoralabs/khora-registry/agent-client";

import { khoraCliResolvedConfig } from "../khora-app-config";
import { registryUrlFromFlags } from "../lib/flags";

export function cliRegistryUrl(flags: FlagMap): string {
  const cfg = khoraCliResolvedConfig(flags);
  return (registryUrlFromFlags(flags) ?? cfg.registryUrl ?? defaultRegistryUrl()).replace(
    /\/$/,
    "",
  );
}
