import { createInMemoryObpPersistenceClient } from "@khoralabs/obp-v2-persistence";
import type { AtriumCliContext } from "./context.ts";
import { POST_DELETE_ROOT, postDeleteLinearTransitions } from "./graphs/post-delete-linear.ts";
import { runLinearObpFlow } from "./obp/linear-runner.ts";

export async function runPostDeleteInteractiveFlow(
  ctx: AtriumCliContext,
  postId: string,
): Promise<void> {
  const obp = createInMemoryObpPersistenceClient();
  const result = await runLinearObpFlow({
    obp,
    partyName: "atrium-cli",
    rootOfferType: POST_DELETE_ROOT,
    transitions: postDeleteLinearTransitions,
    readLine: ctx.readLine,
  });

  const confirm = String(result.bindsByStep.confirm?.confirmation ?? "").trim();
  if (confirm !== "DELETE") {
    throw new Error('Aborted (expected exact "DELETE").');
  }

  await ctx.client.deletePost(postId);
}
