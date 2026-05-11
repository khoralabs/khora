import type { AtriumCliContext } from "../flows/context.ts";
import { requireAgentDid } from "../flows/require-agent-did.ts";
import { runTopicSubscribeInteractiveFlow } from "../flows/topic-flow.ts";
import type { FlagMap } from "./types.ts";

export async function runTopicSubscribeCommand(
  ctx: AtriumCliContext,
  slug: string | undefined,
  _flags: FlagMap,
): Promise<void> {
  const { client } = ctx;
  if (slug !== undefined && slug.length > 0) {
    const did = requireAgentDid();
    const out = await client.subscribeTopic(did, slug);
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  await runTopicSubscribeInteractiveFlow(ctx);
}
