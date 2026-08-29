import type { FlagMap } from "@khoralabs/cli-kit";
import { boolFlag } from "@khoralabs/cli-kit";

import { resolveCliVersion } from "../lib/cli-version";

export function handleVersion(flags: FlagMap): void {
  const version = resolveCliVersion();
  if (boolFlag(flags, "json")) {
    console.log(JSON.stringify({ version }, null, 2));
    return;
  }
  console.log(version);
}
