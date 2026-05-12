import type { CommandHelp } from "./types.ts";

export const whoamiHelp: CommandHelp = {
  command: "whoami",
  summary: "Show this agent's DID and username (offline-first; reads the profile-sync cache).",
  args: `atrium whoami [--no-fetch] [--json]
  Prefers the local profile-sync cache so it works while the host is unreachable.
  --no-fetch  Never contact the host; rely only on the cached snapshot.
  --json      Emit a machine-readable JSON object.
Exit codes:
  0 = identity + cached/live profile printed
  1 = identity missing (run 'atrium key generate')
  3 = no cached profile and host unreachable (or --no-fetch)`,
};
