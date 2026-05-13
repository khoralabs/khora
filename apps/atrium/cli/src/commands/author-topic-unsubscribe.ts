import type { AtriumCliContext } from "../flows/context.ts";
import type { FlagMap } from "./types.ts";

export async function runAuthorTopicUnsubscribeCommand(
  ctx: AtriumCliContext,
  username: string | undefined,
  topicSlug: string | undefined,
  _flags: FlagMap,
): Promise<void> {
  if (
    username === undefined ||
    username.trim().length === 0 ||
    topicSlug === undefined ||
    topicSlug.trim().length === 0
  ) {
    throw new Error("usage: atrium author topic unsubscribe <username> <topic-slug>");
  }
  await ctx.client.unsubscribeAuthorTopic(username.trim(), topicSlug.trim());
}
