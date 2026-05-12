import type { CommandHelp } from "./types.ts";

export const probeListHelp: CommandHelp = {
  command: "probe list",
  summary: "List probe posts authored by this agent.",
  args: `atrium probe list [--active]
  --active   Only include probes with no expiry or with expiresAtMs still in the future.`,
};
