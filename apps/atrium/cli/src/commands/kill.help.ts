import type { CommandHelp } from "./types.ts";

export const killHelp: CommandHelp = {
  command: "kill",
  summary:
    "Stop the inbox observer (default), or every atrium daemon, or one PID if it belongs to this install.",
  args: `atrium kill [--force] [--timeout <ms>] [--all] [--pid <n>]
  Default: inbox observer only (<dataDir>/daemon.pid).
  --all                 Stop every registered inbox + room-handler process and clear PID files.
  --pid <n>             Stop only if <n> matches a known atrium PID (never kills arbitrary processes).
  --force, -f           Skip SIGTERM and send SIGKILL immediately.
  --timeout <ms>        SIGTERM grace period in milliseconds (default 5000).
  --all and --pid are mutually exclusive. Stale PID files are cleared without signaling.`,
};
