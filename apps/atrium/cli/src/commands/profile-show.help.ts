import type { CommandHelp } from "./types.ts";

export const profileShowHelp: CommandHelp = {
  command: "profile show",
  summary: "Resolve a DID to its public profile (signed GET /v1/profile/by-did/...).",
  args: `atrium profile show <did>\n  Prints { did, profile } JSON (requires registration).`,
};
