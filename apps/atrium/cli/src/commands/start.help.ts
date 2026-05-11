import type { CommandHelp } from "./types.ts";

export const startHelp: CommandHelp = {
  command: "start",
  summary: "Start the inbox daemon. Only one instance may run at a time.",
  args: `atrium start [--background|-b] [--config <path>] [--json] [--log <path>]
  --background, -b   Detach and run in the background; print {pid, log} as JSON.
  --config <path>    Forwarded to the daemon (overrides ATRIUM_CONFIG).
  --json             Daemon emits JSON lines (forwarded; takes precedence over config).
  --log <path>       Background log destination. Default: <dataDir>/daemon.log
                     (or ~/.atrium/daemon.log when dataDir is unset).
Foreground mode inherits stdio and exits with the daemon's exit code; SIGINT/SIGTERM
are forwarded. Background mode polls the PID file briefly to confirm acquisition.`,
};
