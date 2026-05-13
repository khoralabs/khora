import type { AtriumCliContext } from "../flows/context.ts";
import type { FlagMap } from "./types.ts";

export async function runAuthorListCommand(ctx: AtriumCliContext, _flags: FlagMap): Promise<void> {
  const subs = await ctx.client.listAuthorSubscriptions();
  console.log(JSON.stringify(subs, null, 2));
}
