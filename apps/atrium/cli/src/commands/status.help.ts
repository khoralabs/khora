import type { CommandHelp } from "./types.ts";

export const statusHelp: CommandHelp = {
  command: "status",
  summary: "List inbox observer and room-handler daemons (PID, kind, state, paths).",
  args: `atrium status [--json]
  Scans <dataDir>/daemon.pid and <dataDir>/daemons/rooms/*.pid.
  Exit codes:
    0 = ok (informational; prints 'No Atrium daemons running.' when nothing is live)
    2 = at least one stale PID file (process gone; run 'atrium kill --all' to clear)
  --json                Emit { entries, hasRunning, hasStale }.`,
};
