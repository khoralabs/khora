import type { CommandHelp } from "./types.ts";

export const topicUnsubscribeHelp: CommandHelp = {
  command: "topic unsubscribe",
  summary: "Unsubscribe from a topic.",
  wizard: `atrium topic unsubscribe
  Lists your current subscriptions and prompts you to pick one to remove.`,
  args: `atrium topic unsubscribe <slug>
  Unsubscribes directly from the given topic slug, skipping the picker.`,
};
