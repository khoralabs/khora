import type { AtriumCliContext } from "../flows/context.ts";
import type { FlagMap } from "./types.ts";

export async function runAuthorSubscribeCommand(
  ctx: AtriumCliContext,
  username: string | undefined,
  _flags: FlagMap,
): Promise<void> {
  if (username === undefined || username.trim().length === 0) {
    throw new Error("usage: atrium author subscribe <username>");
  }
  const out = await ctx.client.subscribeAuthor(username.trim());
  console.log(JSON.stringify(out, null, 2));
}
