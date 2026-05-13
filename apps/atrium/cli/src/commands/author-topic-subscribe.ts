import type { AtriumCliContext } from "../flows/context.ts";
import type { FlagMap } from "./types.ts";

export async function runAuthorTopicSubscribeCommand(
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
    throw new Error("usage: atrium subscriptions create author-topic <username> <topic-slug>");
  }
  const out = await ctx.client.subscribeAuthorTopic(username.trim(), topicSlug.trim());
  console.log(JSON.stringify(out, null, 2));
}
