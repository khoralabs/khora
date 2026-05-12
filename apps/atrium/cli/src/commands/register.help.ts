import type { CommandHelp } from "./types.ts";

export const registerHelp: CommandHelp = {
  command: "register",
  summary: "Register this DID with the host and create a profile.",
  wizard: `atrium register
  Prompts for username (required), display name, bio, and (if required) invite token.`,
  args: `atrium register --username <s> [--display-name <s>] [--bio <s>] [--invite-token <s>]
  --username <s>       Globally unique handle. Required when running non-interactively.
                       Lowercase a-z 0-9 -, 1-39 chars, start/end alphanumeric.
  --display-name <s>   Optional display name
  --bio <s>            Short bio
  --invite-token <s>   Invite token if the host requires one
Passing any of the above skips the wizard.`,
};
