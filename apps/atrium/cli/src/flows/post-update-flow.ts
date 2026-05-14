import { normalizeTopicSlug, zAtriumPostKind, zAtriumPostPatch } from "@khoralabs/atrium-contracts";
import { createInMemoryObpPersistenceClient } from "@khoralabs/obp-v2-persistence";
import type { AtriumCliContext } from "./context.ts";
import { POST_UPDATE_ROOT, postUpdateLinearTransitions } from "./graphs/post-update-linear.ts";
import { runLinearObpFlow } from "./obp/linear-runner.ts";
import { normalizeMatchKindsInput, parseExpiresAtMsInput } from "./parse-probe-fields.ts";

export async function runPostUpdateInteractiveFlow(
  ctx: AtriumCliContext,
  postId: string,
): Promise<void> {
  const obp = createInMemoryObpPersistenceClient();
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
  const matchKinds = normalizeMatchKindsInput(row.match);
  const score = row.score;
  const expiresAtMs = parseExpiresAtMsInput(row.expires);

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
  if (matchKinds !== undefined) {
    patchRaw.matchPostKinds = matchKinds;
  }
  if (typeof score === "number") {
    patchRaw.minHitScore = score;
  }
  if (expiresAtMs !== undefined) {
    patchRaw.expiresAtMs = expiresAtMs;
  }

  const patch = zAtriumPostPatch.parse(patchRaw);
  if (Object.keys(patch).length === 0) {
    throw new Error("Provide at least one field to update.");
  }

  const post = await ctx.client.updatePost(postId, patch);
  console.log(JSON.stringify(post, null, 2));
}
