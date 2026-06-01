import { requireFlowString, runOfferFlow } from "@khoralabs/cli-flow-nbc";
import { splitTopics } from "@khoralabs/cli-kit";
import type {
  KhoraPostCreateContent,
  KhoraPostPatch,
  KhoraPostVisibility,
} from "@khoralabs/khora-contracts";
import type { KhoraCliContext } from "./context";
import { postsCreateFlowDefinition, postsUpdateFlowDefinition } from "./definitions";
import { createKhoraFlowChainView } from "./khora-flow-chain";

function parseVisibility(raw: string | undefined): KhoraPostVisibility | undefined {
  const v = raw?.trim();
  if (v === undefined || v.length === 0) return undefined;
  if (v === "public" || v === "network" || v === "private") return v;
  throw new Error("Visibility must be public, network, or private.");
}

export async function runPostCreateInteractiveFlow(
  ctx: KhoraCliContext,
): Promise<Omit<KhoraPostCreateContent, "kind">> {
  const row = await runOfferFlow({
    readLine: ctx.readLine,
    chain: createKhoraFlowChainView(),
    def: postsCreateFlowDefinition,
    offerId: "create",
  });

  const body = requireFlowString(row, "body").trim();
  if (body.length === 0) {
    throw new Error("Body is required.");
  }
  const title = row.title?.trim();
  const topics = splitTopics(row.topics?.trim());
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
  const row = await runOfferFlow({
    readLine: ctx.readLine,
    chain: createKhoraFlowChainView(),
    def: postsUpdateFlowDefinition,
    offerId: "update",
  });

  const body = row.body?.trim();
  const title = row.title?.trim();
  const topics = splitTopics(row.topics?.trim());
  const visibility = parseVisibility(row.visibility);
  const patch: Omit<KhoraPostPatch, "authorSignature"> = {
    ...(body !== undefined && body.length > 0 ? { body } : {}),
    ...(title !== undefined && title.length > 0 ? { title } : {}),
    ...(topics !== undefined ? { topics } : {}),
    ...(visibility !== undefined ? { visibility } : {}),
  };

  if (Object.keys(patch).length === 0) {
    throw new Error("At least one update field is required.");
  }
  return patch;
}
