import type { CommandHelp } from "@khoralabs/cli-kit";

export const whoamiHelp: CommandHelp = {
  command: "whoami",
  summary: "Show local agent DID and public profile from the Khora host",
  args: `vellum whoami [--base-url=…] [--json] [--no-fetch]
  Uses the same identity as register (ATRIUM_AGENT_KEY_PATH / default path).
  Omit --no-fetch to GET /v1/profile/by-did/<did> on the host.
  --no-fetch  Print DID only; no HTTP.
  --json      Machine-readable output.`,
};
