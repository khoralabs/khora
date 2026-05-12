import type { CommandHelp } from "./types.ts";

export const topicListHelp: CommandHelp = {
  command: "topic list",
  summary: "List active topic subscriptions for this agent.",
  args: `atrium topic list
  Prints the topic slugs this agent is currently subscribed to as a JSON array.`,
};
