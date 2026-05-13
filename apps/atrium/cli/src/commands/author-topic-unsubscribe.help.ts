import type { CommandHelp } from "./types.ts";

export const authorTopicUnsubscribeHelp: CommandHelp = {
  command: "author topic unsubscribe",
  summary: "Remove an (author, topic) subscription.",
  args: `atrium author topic unsubscribe <username> <topic-slug>\n  DELETE /v1/authors/<username>/topics/<slug>/subscribe.`,
};
