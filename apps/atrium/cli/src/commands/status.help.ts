import type { CommandHelp } from "./types.ts";

export const statusHelp: CommandHelp = {
  command: "status",
  summary: "List inbox observer daemon (PID, state, paths).",
  args: `atrium status [--json]
  Scans <dataDir>/daemon.pid.
  Exit codes:
    0 = ok (informational; prints 'No Atrium daemons running.' when nothing is live)
    2 = stale PID file (process gone; run 'atrium kill' to clear)
  --json                Emit { entries, hasRunning, hasStale }.`,
};
