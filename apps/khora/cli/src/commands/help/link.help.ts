import type { CommandHelp } from "@khoralabs/cli-kit";

export const linkHelp: CommandHelp = {
  command: "link",
  summary: "Link local agent to a registry account (browser or auth.md OTP)",
  wizard: `khora link
# browser device flow, or agent-native OTP:
khora link --email=user@example.com
khora link --email=user@example.com --otp=123456`,
  args: `khora link [--host=<slug>] [--email=<addr>] [--otp=<code>] [--no-open] [--json]
khora link status | link unlink [--host=<slug>] [--json]
# Requires khora host use <slug> (or --host). KHORA_REGISTRY_URL defaults to https://r.khoralabs.com.`,
};
