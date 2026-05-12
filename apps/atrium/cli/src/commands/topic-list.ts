import type { AtriumCliContext } from "../flows/context.ts";
import type { FlagMap } from "./types.ts";

export async function runTopicListCommand(ctx: AtriumCliContext, _flags: FlagMap): Promise<void> {
  const slugs = await ctx.client.listTopicSubscriptions();
  console.log(JSON.stringify(slugs, null, 2));
}
