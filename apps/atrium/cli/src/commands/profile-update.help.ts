import type { CommandHelp } from "./types.ts";

export const profileUpdateHelp: CommandHelp = {
  command: "profile update",
  summary: "Edit the profile bound to this DID.",
  wizard: `atrium profile update
  Prompts for new display name and bio.`,
  args: `atrium profile update [--display-name <s>] [--bio <s>]
  --display-name <s>   New display name
  --bio <s>            New bio
Passing any of the above skips the wizard.`,
};
