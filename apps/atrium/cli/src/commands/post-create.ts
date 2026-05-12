import { zAtriumPostCreate } from "@khoralabs/atrium-contracts";
import type { AtriumCliContext } from "../flows/context.ts";
import { runPostCreateInteractiveFlow } from "../flows/post-create-flow.ts";
import { splitTopics, strFlag } from "./parse.ts";
import type { FlagMap } from "./types.ts";

function postCreateUseLegacy(flags: FlagMap): boolean {
  return strFlag(flags, "body") !== undefined;
}

export async function runPostCreateCommand(ctx: AtriumCliContext, flags: FlagMap): Promise<void> {
  const { client } = ctx;
  if (postCreateUseLegacy(flags)) {
    const body = strFlag(flags, "body");
    if (body === undefined || body.length === 0) {
      console.error("post create: --body required in legacy mode");
      process.exit(1);
    }
    const topics = splitTopics(strFlag(flags, "topics"));
    const raw = {
      body,
      ...(strFlag(flags, "title") !== undefined ? { title: strFlag(flags, "title") } : {}),
      ...(topics !== undefined ? { topics } : {}),
      ...(strFlag(flags, "kind") !== undefined ? { kind: strFlag(flags, "kind") } : {}),
    };
    const createBody = zAtriumPostCreate.parse(raw);
    const post = await client.createPost(createBody);
    console.log(JSON.stringify(post, null, 2));
    return;
  }
  await runPostCreateInteractiveFlow(ctx);
}
