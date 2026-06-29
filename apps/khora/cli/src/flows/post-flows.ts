import type { FlowDefinition } from "@khoralabs/cli-flow-nbc";
import { requireFlowString, runOfferFlow } from "@khoralabs/cli-flow-nbc";
import { splitTopics } from "@khoralabs/cli-kit";
import type {
  KhoraPostCreateContent,
  KhoraPostPatch,
  KhoraPostVisibility,
} from "@khoralabs/khora-contracts";
import {
  mergeTopicLists,
  parseTopicsFromBody,
  topicsCreatePromptLine,
  topicsUpdatePromptLine,
} from "../lib/post-topics";
import type { KhoraCliContext } from "./context";
import { postsCreateFlowDefinition, postsUpdateFlowDefinition } from "./definitions";
import { createKhoraFlowChainView } from "./khora-flow-chain";

function parseVisibility(raw: string | undefined): KhoraPostVisibility | undefined {
  const v = raw?.trim();
  if (v === undefined || v.length === 0) return undefined;
  if (v === "public" || v === "network" || v === "private") return v;
  throw new Error("Visibility must be public, network, or private.");
}

function flowAfterBodyPrompt(
  def: FlowDefinition,
  offerId: string,
  topicsPrompt: string,
): FlowDefinition {
  const offer = def.offers.find((o) => o.id === offerId);
  if (offer === undefined) {
    throw new Error(`flow missing offer "${offerId}"`);
  }
  return {
    ...def,
    offers: [
      {
        ...offer,
        ports: offer.ports
          .filter((port) => port.id !== "body")
          .map((port) => (port.id === "topics" ? { ...port, prompt: topicsPrompt } : port)),
      },
    ],
  };
}

export async function runPostCreateInteractiveFlow(
  ctx: KhoraCliContext,
): Promise<Omit<KhoraPostCreateContent, "kind">> {
  const body = requireFlowString(
    { body: (await ctx.readLine("Body: ")).trim() },
    "body",
    "Body is required.",
  );
  const bodyTopics = parseTopicsFromBody(body);

  const row = await runOfferFlow({
    readLine: ctx.readLine,
    chain: createKhoraFlowChainView(),
    def: flowAfterBodyPrompt(
      postsCreateFlowDefinition,
      "create",
      topicsCreatePromptLine(bodyTopics),
    ),
    offerId: "create",
  });

  const title = row.title?.trim();
  const topics = mergeTopicLists(bodyTopics, splitTopics(row.topics?.trim()));
  const visibility = parseVisibility(row.visibility);

  return {
    body,
    ...(title !== undefined && title.length > 0 ? { title } : {}),
    ...(topics !== undefined ? { topics } : {}),
    visibility: visibility ?? "public",
  };
}

export async function runPostUpdateInteractiveFlow(
  ctx: KhoraCliContext,
): Promise<Omit<KhoraPostPatch, "authorSignature">> {
  const bodyRaw = (await ctx.readLine("Body (leave empty to skip): ")).trim();
  const bodyTopics = bodyRaw.length > 0 ? parseTopicsFromBody(bodyRaw) : [];

  const row = await runOfferFlow({
    readLine: ctx.readLine,
    chain: createKhoraFlowChainView(),
    def: flowAfterBodyPrompt(
      postsUpdateFlowDefinition,
      "update",
      topicsUpdatePromptLine(bodyTopics),
    ),
    offerId: "update",
  });

  const title = row.title?.trim();
  const topics = mergeTopicLists(bodyTopics, splitTopics(row.topics?.trim()));
  const visibility = parseVisibility(row.visibility);
  const patch: Omit<KhoraPostPatch, "authorSignature"> = {
    ...(bodyRaw.length > 0 ? { body: bodyRaw } : {}),
    ...(title !== undefined && title.length > 0 ? { title } : {}),
    ...(topics !== undefined ? { topics } : {}),
    ...(visibility !== undefined ? { visibility } : {}),
  };

  if (Object.keys(patch).length === 0) {
    throw new Error("At least one update field is required.");
  }
  return patch;
}
