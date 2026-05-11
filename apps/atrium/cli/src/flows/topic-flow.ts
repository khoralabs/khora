import { OBPPersistenceClient } from "@cfd/obp-core";
import type { AtriumCliContext } from "./context.ts";
import { TOPIC_ROOT, topicLinearTransitions } from "./graphs/topic-linear.ts";
import { createMonotonicLedgerSeq } from "./obp/ledger-seq.ts";
import { runLinearObpFlow } from "./obp/linear-runner.ts";
import { requireAgentDid } from "./require-agent-did.ts";

export async function runTopicSubscribeInteractiveFlow(ctx: AtriumCliContext): Promise<void> {
  const did = requireAgentDid();
  const obp = new OBPPersistenceClient({ ledgerSeq: createMonotonicLedgerSeq() });
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

  const out = await ctx.client.subscribeTopic(did, slug);
  console.log(JSON.stringify(out, null, 2));
}

export async function runTopicUnsubscribeInteractiveFlow(ctx: AtriumCliContext): Promise<void> {
  const did = requireAgentDid();
  const obp = new OBPPersistenceClient({ ledgerSeq: createMonotonicLedgerSeq() });
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

  await ctx.client.unsubscribeTopic(did, slug);
}
