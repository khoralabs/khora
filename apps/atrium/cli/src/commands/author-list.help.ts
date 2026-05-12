import type { CommandHelp } from "./types.ts";

export const authorListHelp: CommandHelp = {
  command: "author list",
  summary: "List author DIDs this agent follows (by username subscription).",
  args: `atrium author list\n  Prints the author DIDs as a JSON array (GET /v1/authors/subscriptions).`,
};
