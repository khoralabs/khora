import type { CommandHelp } from "./types.ts";

export const statusHelp: CommandHelp = {
  command: "status",
  summary: "Report whether the inbox daemon is running.",
  args: `atrium status [--json]
  Reads <dataDir>/daemon.pid (or ~/.atrium/daemon.pid). Exit codes:
    0 = running         (prints 'running pid=<n> log=<path>')
    2 = stale pid file  (process gone; run 'atrium kill' to clear)
    3 = not running
  --json                Emit the raw status object.`,
};
