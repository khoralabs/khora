import type { CommandHelp } from "./types.ts";

export const registerHelp: CommandHelp = {
  command: "register",
  summary: "Register this DID with the host and create a profile.",
  wizard: `atrium register
  Prompts for display name, bio, and (if required) invite token.`,
  args: `atrium register [--display-name <s>] [--bio <s>] [--invite-token <s>]
  --display-name <s>   Display name for the profile
  --bio <s>            Short bio
  --invite-token <s>   Invite token if the host requires one
Passing any of the above skips the wizard.`,
};
