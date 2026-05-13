import type { CommandHelp } from "./types.ts";

export const authorListHelp: CommandHelp = {
  command: "author list",
  summary: "List author DIDs and (author, topic) tuple subscriptions.",
  args: `atrium author list\n  Prints JSON: authorDids and authorTopics (GET /v1/authors/subscriptions).`,
};
