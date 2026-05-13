import type { CommandHelp } from "./types.ts";

export const authorTopicSubscribeHelp: CommandHelp = {
  command: "author topic subscribe",
  summary: "Follow posts that match a specific author and topic.",
  args: `atrium author topic subscribe <username> <topic-slug>\n  Subscribes to the (author, topic) tuple (POST /v1/authors/<username>/topics/<slug>/subscribe).`,
};
