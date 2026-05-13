import type { AtriumCliContext } from "../flows/context.ts";
import type { FlagMap } from "./types.ts";

export async function runPostShowCommand(
  ctx: AtriumCliContext,
  postId: string | undefined,
  _flags: FlagMap,
): Promise<void> {
  if (postId === undefined || postId.trim().length === 0) {
    throw new Error("usage: atrium post show <post-id>");
  }
  const post = await ctx.client.getPost(postId.trim());
  console.log(JSON.stringify(post, null, 2));
}
