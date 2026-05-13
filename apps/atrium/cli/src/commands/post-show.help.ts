import type { CommandHelp } from "./types.ts";

export const postShowHelp: CommandHelp = {
  command: "post show",
  summary: "Fetch a post by id (signed GET /v1/posts/:id).",
  args: `atrium post show <post-id>\n  Prints the post JSON (requires registration).`,
};
