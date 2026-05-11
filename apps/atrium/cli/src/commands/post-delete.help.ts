import type { CommandHelp } from "./types.ts";

export const postDeleteHelp: CommandHelp = {
  command: "post delete",
  summary: "Delete a post you own. Post id is required in both modes.",
  wizard: `atrium post delete <id>
  Prompts for confirmation before deleting.`,
  args: `atrium post delete <id> --yes
  --yes, -y    Skip the interactive confirmation prompt.`,
};
