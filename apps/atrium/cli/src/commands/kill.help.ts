import type { CommandHelp } from "./types.ts";

export const killHelp: CommandHelp = {
  command: "kill",
  summary:
    "Stop the inbox observer (default), clear stale PID files, or stop when --pid matches the inbox PID.",
  args: `atrium kill [--force] [--timeout <ms>] [--all] [--pid <n>]
  Default: inbox observer only (<dataDir>/daemon.pid).
  --all                 Stop the inbox PID if stale or running; clear PID file.
  --pid <n>             Stop only if <n> matches the known inbox daemon PID (never kills arbitrary processes).
  --force, -f           Skip SIGTERM and send SIGKILL immediately.
  --timeout <ms>        SIGTERM grace period in milliseconds (default 5000).
  --all and --pid are mutually exclusive. Stale PID files are cleared without signaling.`,
};
