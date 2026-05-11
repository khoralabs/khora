import { type AtriumPostPatch, zAtriumPostKind, zAtriumPostPatch } from "@cfd/atrium-contracts";
import type { AtriumCliContext } from "../flows/context.ts";
import { runPostUpdateInteractiveFlow } from "../flows/post-update-flow.ts";
import { requireAgentDid } from "../flows/require-agent-did.ts";
import { splitTopics, strFlag } from "./parse.ts";
import type { FlagMap } from "./types.ts";

function postUpdateUseLegacy(flags: FlagMap): boolean {
  return (
    strFlag(flags, "body") !== undefined ||
    strFlag(flags, "title") !== undefined ||
    strFlag(flags, "topics") !== undefined ||
    strFlag(flags, "kind") !== undefined
  );
}

function patchFromFlags(flags: FlagMap): AtriumPostPatch {
  const patch: AtriumPostPatch = {};
  const body = strFlag(flags, "body");
  const title = strFlag(flags, "title");
  const kind = strFlag(flags, "kind");
  const topics = splitTopics(strFlag(flags, "topics"));
  if (body !== undefined) patch.body = body;
  if (title !== undefined) patch.title = title;
  if (kind !== undefined) patch.kind = zAtriumPostKind.parse(kind);
  if (topics !== undefined) patch.topics = topics;
  return patch;
}

export async function runPostUpdateCommand(
  ctx: AtriumCliContext,
  postId: string,
  flags: FlagMap,
): Promise<void> {
  const { client } = ctx;
  if (postId.length === 0) {
    console.error("post update: post id required");
    process.exit(1);
  }
  if (postUpdateUseLegacy(flags)) {
    const did = requireAgentDid();
    const patch = patchFromFlags(flags);
    zAtriumPostPatch.parse(patch);
    if (Object.keys(patch).length === 0) {
      console.error("post update: pass at least one of --body --title --topics --kind");
      process.exit(1);
    }
    const post = await client.updatePost(did, postId, patch);
    console.log(JSON.stringify(post, null, 2));
    return;
  }
  await runPostUpdateInteractiveFlow(ctx, postId);
}
