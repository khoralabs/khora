import { type AtriumPost, zAtriumPost } from "@khoralabs/atrium-contracts";
import { SWARM_AGGREGATE_DOMAIN, SWARM_EVENT_KIND } from "@khoralabs/swarm-host";
import type { AtriumHostContext } from "./create-atrium-host.ts";

/**
 * Deletes every status post for `profileId` except `keepPostId` by emitting `POST_DELETED`
 * (same payload shape as the HTTP DELETE handler).
 */
export async function deleteOtherStatusPostsForAuthor(
  ctx: AtriumHostContext,
  profileId: string,
  keepPostId: string,
): Promise<void> {
  const rows = ctx.host.persistenceClient.listPostRowsByAuthorProfileIdAndKind({
    authorProfileId: profileId,
    kind: "status",
    limit: 500,
  });
  for (const row of rows) {
    if (row.id === keepPostId) continue;
    let post: AtriumPost;
    try {
      post = zAtriumPost.parse(JSON.parse(row.bodyJson));
    } catch {
      continue;
    }
    if (post.kind !== "status") continue;
    await ctx.host.notify({
      kind: SWARM_EVENT_KIND.POST_DELETED,
      occurredAt: Date.now(),
      aggregate: { domain: SWARM_AGGREGATE_DOMAIN.post, id: post.id },
      change: "deleted",
      source: "app",
      payload: { post },
    });
  }
}
