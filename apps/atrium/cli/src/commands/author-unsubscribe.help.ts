import type { CommandHelp } from "./types.ts";

export const authorUnsubscribeHelp: CommandHelp = {
  command: "author unsubscribe",
  summary: "Stop following an author by username.",
  args: `atrium author unsubscribe <username>\n  DELETE /v1/authors/<username>/subscribe.`,
};
