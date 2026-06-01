import { requireFlowString, runOfferFlow } from "@khoralabs/cli-flow-nbc";
import type { KhoraPostVisibility } from "@khoralabs/khora-contracts";

import type { KhoraCliContext } from "./context";
import {
  subscriptionsCreateAuthorFlowDefinition,
  subscriptionsCreateAuthorTopicFlowDefinition,
  subscriptionsCreateSemanticFlowDefinition,
  subscriptionsCreateTopicFlowDefinition,
} from "./definitions";
import { createKhoraFlowChainView } from "./khora-flow-chain";

function parseVisibility(raw: string | undefined): KhoraPostVisibility | undefined {
  const v = raw?.trim();
  if (v === undefined || v.length === 0) return undefined;
  if (v === "public" || v === "network" || v === "private") return v;
  throw new Error("Visibility must be public, network, or private.");
}

export type SubscriptionTopicFlowResult = {
  slug: string;
  visibility: KhoraPostVisibility;
};

export type SubscriptionAuthorFlowResult = {
  username: string;
  visibility: KhoraPostVisibility;
};

export type SubscriptionAuthorTopicFlowResult = SubscriptionAuthorFlowResult & {
  slug: string;
};

export type SubscriptionSemanticFlowResult = {
  searchText: string;
  body?: string;
  minScore?: number;
  visibility: KhoraPostVisibility;
};

export async function runSubscriptionTopicCreateFlow(
  ctx: KhoraCliContext,
): Promise<SubscriptionTopicFlowResult> {
  const row = await runOfferFlow({
    readLine: ctx.readLine,
    chain: createKhoraFlowChainView(),
    def: subscriptionsCreateTopicFlowDefinition,
    offerId: "create",
  });

  const slug = requireFlowString(row, "slug").trim();
  if (slug.length === 0) throw new Error("Topic slug is required.");

  return {
    slug,
    visibility: parseVisibility(row.visibility) ?? "public",
  };
}

export async function runSubscriptionAuthorCreateFlow(
  ctx: KhoraCliContext,
): Promise<SubscriptionAuthorFlowResult> {
  const row = await runOfferFlow({
    readLine: ctx.readLine,
    chain: createKhoraFlowChainView(),
    def: subscriptionsCreateAuthorFlowDefinition,
    offerId: "create",
  });

  const username = requireFlowString(row, "username").trim();
  if (username.length === 0) throw new Error("Username is required.");

  return {
    username,
    visibility: parseVisibility(row.visibility) ?? "public",
  };
}

export async function runSubscriptionAuthorTopicCreateFlow(
  ctx: KhoraCliContext,
): Promise<SubscriptionAuthorTopicFlowResult> {
  const row = await runOfferFlow({
    readLine: ctx.readLine,
    chain: createKhoraFlowChainView(),
    def: subscriptionsCreateAuthorTopicFlowDefinition,
    offerId: "create",
  });

  const username = requireFlowString(row, "username").trim();
  const slug = requireFlowString(row, "slug").trim();
  if (username.length === 0) throw new Error("Username is required.");
  if (slug.length === 0) throw new Error("Topic slug is required.");

  return {
    username,
    slug,
    visibility: parseVisibility(row.visibility) ?? "public",
  };
}

function parseMinScore(raw: string | undefined): number | undefined {
  const v = raw?.trim();
  if (v === undefined || v.length === 0) return undefined;
  const n = Number.parseFloat(v);
  if (Number.isNaN(n)) throw new Error("Min score must be a number.");
  return n;
}

export async function runSubscriptionSemanticCreateFlow(
  ctx: KhoraCliContext,
): Promise<SubscriptionSemanticFlowResult> {
  const row = await runOfferFlow({
    readLine: ctx.readLine,
    chain: createKhoraFlowChainView(),
    def: subscriptionsCreateSemanticFlowDefinition,
    offerId: "create",
  });

  const searchText = requireFlowString(row, "searchText").trim();
  if (searchText.length === 0) throw new Error("Search text is required.");

  const bodyRaw = row.body?.trim();
  const body = bodyRaw !== undefined && bodyRaw.length > 0 ? bodyRaw : undefined;

  return {
    searchText,
    body,
    minScore: parseMinScore(row.minScore),
    visibility: parseVisibility(row.visibility) ?? "public",
  };
}
