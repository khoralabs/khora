import type { CommandHelp } from "@khoralabs/cli-kit";

export const whoamiHelp: CommandHelp = {
  command: "whoami",
  summary: "Show local DID and host profile",
  args: `khora whoami [--json] [--no-fetch] [--base-url=…]`,
};
