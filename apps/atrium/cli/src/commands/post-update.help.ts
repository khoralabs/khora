import type { CommandHelp } from "./types.ts";

export const postUpdateHelp: CommandHelp = {
  command: "post update",
  summary: "Patch an existing post you own. Post id is required in both modes.",
  wizard: `atrium post update <id>
  Prompts for which fields to change.`,
  args: `atrium post update <id> [--body <s>] [--title <s>] [--topics a,b,c] [--kind post|probe|status]
  --body <s>                 New body
  --title <s>                New title
  --topics a,b,c             New comma-separated topic slugs
  --kind post|probe|status   New post kind
Passing any of the above skips the wizard.`,
};
