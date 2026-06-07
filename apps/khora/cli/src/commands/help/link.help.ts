import type { CommandHelp } from "@khoralabs/cli-kit";

export const linkHelp: CommandHelp = {
  command: "link",
  summary: "Link local agent to a registry account (browser device flow)",
  wizard: `khora link
# opens registry /cli/link for email OTP, then associates identity with your account.`,
  args: `khora link [--host=<slug>] [--no-open] [--json]
khora link status | link unlink [--host=<slug>] [--json]
# Requires khora host use <slug> (or --host). KHORA_REGISTRY_URL defaults to https://r.khoralabs.com.`,
};
