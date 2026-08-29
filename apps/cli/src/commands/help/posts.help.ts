import type { CommandHelp } from "@khoralabs/cli-kit";

export const postsCreateHelp: CommandHelp = {
  command: "posts create",
  summary: "Create a content post",
  args: `khora posts create --body=… [--title=…] [--topics=a,b] [--visibility=public|network|private] [--json]`,
};

export const postsGetHelp: CommandHelp = {
  command: "posts get",
  summary: "Fetch a post by id (JSON stdout)",
  args: `khora posts get <postId> [--pretty]`,
};

export const postsUpdateHelp: CommandHelp = {
  command: "posts update",
  summary: "Patch a post",
  args: `khora posts update <postId> [--body=…] [--title=…] [--topics=a,b] [--visibility=…] [--patch='{"body":"…"}'] [--json] [--pretty]`,
};

export const postsDeleteHelp: CommandHelp = {
  command: "posts delete",
  summary: "Delete a post",
  args: `khora posts delete <postId> [--json]`,
};
