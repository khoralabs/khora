import type { AtriumCliContext } from "../flows/context.ts";
import type { FlagMap } from "./types.ts";

export async function runAuthorUnsubscribeCommand(
  ctx: AtriumCliContext,
  username: string | undefined,
  _flags: FlagMap,
): Promise<void> {
  if (username === undefined || username.trim().length === 0) {
    throw new Error("usage: atrium author unsubscribe <username>");
  }
  await ctx.client.unsubscribeAuthor(username.trim());
}
