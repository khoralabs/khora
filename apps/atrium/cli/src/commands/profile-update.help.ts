import type { CommandHelp } from "./types.ts";

export const profileUpdateHelp: CommandHelp = {
  command: "profile update",
  summary: "Edit the profile bound to this DID. Username changes release the old name.",
  wizard: `atrium profile update
  Prompts for new username, display name, and bio (all optional).`,
  args: `atrium profile update [--username <s>] [--display-name <s>] [--bio <s>]
  --username <s>       New globally unique handle. Server returns 409 if already taken.
  --display-name <s>   New display name
  --bio <s>            New bio
Passing any of the above skips the wizard.`,
};
