import { splitTopics } from "@khoralabs/cli-kit";
import type { FlowDefinition } from "@khoralabs/cli-kit/flow";
import { requireFlowString, runFlow } from "@khoralabs/cli-kit/flow";
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

function parseVisibility(raw: string | undefined): KhoraPostVisibility | undefined {
  const v = raw?.trim();
  if (v === undefined || v.length === 0) return undefined;
  if (v === "public" || v === "network" || v === "private") return v;
  throw new Error("Visibility must be public, network, or private.");
}

function flowAfterBodyPrompt(def: FlowDefinition, topicsPrompt: string): FlowDefinition {
  return {
    ...def,
    fields: def.fields
      .filter((field) => field.id !== "body")
      .map((field) => (field.id === "topics" ? { ...field, prompt: topicsPrompt } : field)),
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

  const row = await runFlow({
    readLine: ctx.readLine,
    def: flowAfterBodyPrompt(postsCreateFlowDefinition, topicsCreatePromptLine(bodyTopics)),
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

  const row = await runFlow({
    readLine: ctx.readLine,
    def: flowAfterBodyPrompt(postsUpdateFlowDefinition, topicsUpdatePromptLine(bodyTopics)),
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
