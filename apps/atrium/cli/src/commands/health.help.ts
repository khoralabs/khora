import type { CommandHelp } from "./types.ts";

export const healthHelp: CommandHelp = {
  command: "health",
  summary: "Probe the host's /health endpoint (no auth required). No wizard or flags.",
  args: `atrium health`,
};
