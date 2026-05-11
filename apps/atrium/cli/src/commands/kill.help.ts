import type { CommandHelp } from "./types.ts";

export const killHelp: CommandHelp = {
  command: "kill",
  summary: "Stop the running inbox daemon and clear its PID file.",
  args: `atrium kill [--force] [--timeout <ms>]
  Sends SIGTERM, waits up to --timeout (default 5000), then SIGKILLs if still alive.
  --force               Skip SIGTERM and send SIGKILL immediately.
  --timeout <ms>        SIGTERM grace period in milliseconds (default 5000).
A stale PID file (process already gone) is silently cleared. 'not running' when no
PID file is present.`,
};
