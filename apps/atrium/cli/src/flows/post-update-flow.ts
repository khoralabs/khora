import { normalizeTopicSlug, zAtriumPostKind, zAtriumPostPatch } from "@cfd/atrium-contracts";
import { OBPPersistenceClient } from "@cfd/obp-core";
import type { AtriumCliContext } from "./context.ts";
import { POST_UPDATE_ROOT, postUpdateLinearTransitions } from "./graphs/post-update-linear.ts";
import { createMonotonicLedgerSeq } from "./obp/ledger-seq.ts";
import { runLinearObpFlow } from "./obp/linear-runner.ts";
import { requireAgentDid } from "./require-agent-did.ts";

export async function runPostUpdateInteractiveFlow(
  ctx: AtriumCliContext,
  postId: string,
): Promise<void> {
  const did = requireAgentDid();
  const obp = new OBPPersistenceClient({ ledgerSeq: createMonotonicLedgerSeq() });
  const result = await runLinearObpFlow({
    obp,
    partyName: "atrium-cli",
    rootOfferType: POST_UPDATE_ROOT,
    transitions: postUpdateLinearTransitions,
    readLine: ctx.readLine,
  });

  const row = result.bindsByStep.patch;
  if (row === undefined) {
    throw new Error("post update: missing bind payload");
  }

  const patchRaw: Record<string, unknown> = {};
  const body = row.body;
  const title = row.title;
  const topicsStr = row.topics;
  const kind = row.kind;

  if (body !== undefined && String(body).trim().length > 0) {
    patchRaw.body = String(body).trim();
  }
  if (title !== undefined && String(title).trim().length > 0) {
    patchRaw.title = String(title).trim();
  }
  if (topicsStr !== undefined && String(topicsStr).trim().length > 0) {
    patchRaw.topics = String(topicsStr)
      .split(",")
      .map((s) => normalizeTopicSlug(s.trim()))
      .filter((s) => s.length > 0);
  }
  if (kind !== undefined && String(kind).trim().length > 0) {
    patchRaw.kind = zAtriumPostKind.parse(String(kind).trim());
  }

  const patch = zAtriumPostPatch.parse(patchRaw);
  if (Object.keys(patch).length === 0) {
    throw new Error("Provide at least one field to update.");
  }

  const post = await ctx.client.updatePost(did, postId, patch);
  console.log(JSON.stringify(post, null, 2));
}
