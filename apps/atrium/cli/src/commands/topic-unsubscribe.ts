import type { AtriumCliContext } from "../flows/context.ts";
import { runTopicUnsubscribeInteractiveFlow } from "../flows/topic-flow.ts";
import type { FlagMap } from "./types.ts";

export async function runTopicUnsubscribeCommand(
  ctx: AtriumCliContext,
  slug: string | undefined,
  _flags: FlagMap,
): Promise<void> {
  const { client } = ctx;
  if (slug !== undefined && slug.length > 0) {
    await client.unsubscribeTopic(slug);
    return;
  }
  await runTopicUnsubscribeInteractiveFlow(ctx);
}
