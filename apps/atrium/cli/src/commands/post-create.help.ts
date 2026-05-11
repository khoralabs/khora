import type { CommandHelp } from "./types.ts";

export const postCreateHelp: CommandHelp = {
  command: "post create",
  summary: "Publish a new post.",
  wizard: `atrium post create
  Prompts for kind, title, body, and topics.`,
  args: `atrium post create --body <s> [--title <s>] [--topics a,b,c] [--kind post|probe|status]
  --body <s>                 Post body (required to enter direct mode)
  --title <s>                Optional title
  --topics a,b,c             Comma-separated topic slugs
  --kind post|probe|status   Post kind (default: post)
Passing --body skips the wizard.`,
};
