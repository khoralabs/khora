import { createInMemoryObpPersistenceClient } from "@khoralabs/obp-v2-persistence";
import type { AtriumCliContext } from "./context.ts";
import { TOPIC_ROOT, topicLinearTransitions } from "./graphs/topic-linear.ts";
import { runLinearObpFlow } from "./obp/linear-runner.ts";

export async function runTopicSubscribeInteractiveFlow(ctx: AtriumCliContext): Promise<void> {
  const obp = createInMemoryObpPersistenceClient();
  const result = await runLinearObpFlow({
    obp,
    partyName: "atrium-cli",
    rootOfferType: TOPIC_ROOT,
    transitions: topicLinearTransitions("subscribe"),
    readLine: ctx.readLine,
  });

  const slug = String(result.bindsByStep.topic?.["topic-slug"] ?? "").trim();
  if (slug.length === 0) {
    throw new Error("Topic slug required.");
  }

  const out = await ctx.client.subscribeTopic(slug);
  console.log(JSON.stringify(out, null, 2));
}

export async function runTopicUnsubscribeInteractiveFlow(ctx: AtriumCliContext): Promise<void> {
  const obp = createInMemoryObpPersistenceClient();
  const result = await runLinearObpFlow({
    obp,
    partyName: "atrium-cli",
    rootOfferType: TOPIC_ROOT,
    transitions: topicLinearTransitions("unsubscribe"),
    readLine: ctx.readLine,
  });

  const slug = String(result.bindsByStep.topic?.["topic-slug"] ?? "").trim();
  if (slug.length === 0) {
    throw new Error("Topic slug required.");
  }

  await ctx.client.unsubscribeTopic(slug);
}
