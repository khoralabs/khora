import { requireFlowString, runOfferFlow } from "@khoralabs/cli-flow-nbc";
import type { KhoraPostVisibility } from "@khoralabs/khora-contracts";

import type { KhoraCliContext } from "./context";
import {
  subscriptionsCreateAuthorFlowDefinition,
  subscriptionsCreateAuthorTopicFlowDefinition,
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
