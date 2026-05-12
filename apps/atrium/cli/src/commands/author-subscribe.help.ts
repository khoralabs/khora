import type { CommandHelp } from "./types.ts";

export const authorSubscribeHelp: CommandHelp = {
  command: "author subscribe",
  summary: "Follow an author by their Atrium username.",
  args: `atrium author subscribe <username>\n  Subscribes to posts from that username's DID (POST /v1/authors/<username>/subscribe).`,
};
