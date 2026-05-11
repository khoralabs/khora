import type { CommandHelp } from "./types.ts";

export const inboxListHelp: CommandHelp = {
  command: "inbox list",
  summary: "List inbox notifications for this agent.",
  wizard: `atrium inbox list
  Prompts for limit and whether to mark returned notifications as read.`,
  args: `atrium inbox list [--limit <n>] [--mark-read]
  --limit <n>          Max notifications to return
  --mark-read          Mark returned notifications as read
Passing any of the above skips the wizard.`,
};
