import type { CommandHelp } from "./types.ts";

export const topicSubscribeHelp: CommandHelp = {
  command: "topic subscribe",
  summary: "Subscribe to a topic.",
  wizard: `atrium topic subscribe
  Lists available topics and prompts you to pick one.`,
  args: `atrium topic subscribe <slug>
  Subscribes directly to the given topic slug, skipping the picker.`,
};
