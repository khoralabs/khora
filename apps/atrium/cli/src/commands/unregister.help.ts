import type { CommandHelp } from "./types.ts";

export const unregisterHelp: CommandHelp = {
  command: "unregister",
  summary: "Remove your account from the host (signed POST /v1/unregister).",
  args: `atrium unregister --yes
  --yes / -y   Required confirmation flag.`,
};
