import type { AtriumCliContext } from "../flows/context.ts";
import { runPostDeleteInteractiveFlow } from "../flows/post-delete-flow.ts";
import { boolFlag } from "./parse.ts";
import type { FlagMap } from "./types.ts";

export async function runPostDeleteCommand(
  ctx: AtriumCliContext,
  postId: string,
  flags: FlagMap,
): Promise<void> {
  const { client } = ctx;
  if (postId.length === 0) {
    console.error("post delete: post id required");
    process.exit(1);
  }
  if (boolFlag(flags, "yes", "y")) {
    await client.deletePost(postId);
    return;
  }
  await runPostDeleteInteractiveFlow(ctx, postId);
}
