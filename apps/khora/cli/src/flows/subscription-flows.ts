import { runOfferFlow } from "@khoralabs/cli-flow-nbc";
import type { KhoraPostVisibility } from "@khoralabs/khora-contracts";

import type { KhoraCliContext } from "./context";
import { subscriptionsCreateFlowDefinition } from "./definitions";
import { createKhoraFlowChainView } from "./khora-flow-chain";

function parseVisibility(raw: string | undefined): KhoraPostVisibility | undefined {
  const v = raw?.trim();
  if (v === undefined || v.length === 0) return undefined;
  if (v === "public" || v === "network" || v === "private") return v;
  throw new Error("Visibility must be public, network, or private.");
}

function parseMinScore(raw: string | undefined): number | undefined {
  const v = raw?.trim();
  if (v === undefined || v.length === 0) return undefined;
  const n = Number.parseFloat(v);
  if (Number.isNaN(n)) throw new Error("Min score must be a number.");
  return n;
}

export type SubscriptionCreateFlowResult = {
  topicSlug?: string;
  author?: string;
  queryText?: string;
  body?: string;
  minScore?: number;
  visibility: KhoraPostVisibility;
};

export async function runSubscriptionCreateFlow(
  ctx: KhoraCliContext,
): Promise<SubscriptionCreateFlowResult> {
  const row = await runOfferFlow({
    readLine: ctx.readLine,
    chain: createKhoraFlowChainView(),
    def: subscriptionsCreateFlowDefinition,
    offerId: "create",
  });

  const topicSlug = row.topic?.trim();
  const author = row.author?.trim();
  const queryText = row.query?.trim();
  const hasTopic = topicSlug !== undefined && topicSlug.length > 0;
  const hasAuthor = author !== undefined && author.length > 0;
  const hasQuery = queryText !== undefined && queryText.length > 0;
  if (!hasTopic && !hasAuthor && !hasQuery) {
    throw new Error("At least one of topic, author, or query is required.");
  }

  const bodyRaw = row.body?.trim();
  return {
    ...(hasTopic ? { topicSlug } : {}),
    ...(hasAuthor ? { author } : {}),
    ...(hasQuery ? { queryText } : {}),
    ...(bodyRaw !== undefined && bodyRaw.length > 0 ? { body: bodyRaw } : {}),
    minScore: parseMinScore(row.minScore),
    visibility: parseVisibility(row.visibility) ?? "public",
  };
}
