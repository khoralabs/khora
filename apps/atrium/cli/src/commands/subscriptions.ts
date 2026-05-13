import type { AtriumCliContext } from "../flows/context.ts";
import { runAuthorListCommand } from "./author-list.ts";
import { runAuthorSubscribeCommand } from "./author-subscribe.ts";
import { runAuthorTopicSubscribeCommand } from "./author-topic-subscribe.ts";
import { runAuthorTopicUnsubscribeCommand } from "./author-topic-unsubscribe.ts";
import { runAuthorUnsubscribeCommand } from "./author-unsubscribe.ts";
import { runTopicListCommand } from "./topic-list.ts";
import { runTopicSubscribeCommand } from "./topic-subscribe.ts";
import { runTopicUnsubscribeCommand } from "./topic-unsubscribe.ts";
import type { FlagMap } from "./types.ts";

const SUBSCRIPTION_KINDS = "topic | author | author-topic";

function requireKind(positional: string[], verb: string): string {
  const kind = positional[2]?.trim() ?? "";
  if (kind.length === 0) {
    throw new Error(`usage: atrium subscriptions ${verb} <${SUBSCRIPTION_KINDS}> …`);
  }
  return kind;
}

export async function runSubscriptionsListCommand(
  ctx: AtriumCliContext,
  positional: string[],
  flags: FlagMap,
): Promise<void> {
  const kind = positional[2]?.trim() ?? "";
  if (kind.length === 0) {
    const [topics, authors] = await Promise.all([
      ctx.client.listTopicSubscriptions(),
      ctx.client.listAuthorSubscriptions(),
    ]);
    console.log(JSON.stringify({ topics, authors }, null, 2));
    return;
  }
  if (kind === "topic") {
    await runTopicListCommand(ctx, flags);
    return;
  }
  if (kind === "author") {
    await runAuthorListCommand(ctx, flags);
    return;
  }
  if (kind === "author-topic") {
    const authors = await ctx.client.listAuthorSubscriptions();
    console.log(JSON.stringify(authors.authorTopics, null, 2));
    return;
  }
  throw new Error(
    `subscriptions list: kind must be one of: topic, author, author-topic (or omit for combined JSON)`,
  );
}

export async function runSubscriptionsCreateCommand(
  ctx: AtriumCliContext,
  positional: string[],
  flags: FlagMap,
): Promise<void> {
  const kind = requireKind(positional, "create");
  if (kind === "topic") {
    await runTopicSubscribeCommand(ctx, positional[3], flags);
    return;
  }
  if (kind === "author") {
    await runAuthorSubscribeCommand(ctx, positional[3], flags);
    return;
  }
  if (kind === "author-topic") {
    await runAuthorTopicSubscribeCommand(ctx, positional[3], positional[4], flags);
    return;
  }
  throw new Error(`subscriptions create: kind must be one of: ${SUBSCRIPTION_KINDS}`);
}

export async function runSubscriptionsDeleteCommand(
  ctx: AtriumCliContext,
  positional: string[],
  flags: FlagMap,
): Promise<void> {
  const kind = requireKind(positional, "delete");
  if (kind === "topic") {
    await runTopicUnsubscribeCommand(ctx, positional[3], flags);
    return;
  }
  if (kind === "author") {
    await runAuthorUnsubscribeCommand(ctx, positional[3], flags);
    return;
  }
  if (kind === "author-topic") {
    await runAuthorTopicUnsubscribeCommand(ctx, positional[3], positional[4], flags);
    return;
  }
  throw new Error(`subscriptions delete: kind must be one of: ${SUBSCRIPTION_KINDS}`);
}
