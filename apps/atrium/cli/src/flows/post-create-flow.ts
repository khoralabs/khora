import { normalizeTopicSlug, zAtriumPostCreate } from "@khoralabs/atrium-contracts";
import { OBPPersistenceClient } from "@khoralabs/obp-core";
import type { AtriumCliContext } from "./context.ts";
import { POST_CREATE_ROOT, postCreateLinearTransitions } from "./graphs/post-create-linear.ts";
import { createMonotonicLedgerSeq } from "./obp/ledger-seq.ts";
import { runLinearObpFlow } from "./obp/linear-runner.ts";
import { normalizeMatchKindsInput, parseExpiresAtMsInput } from "./parse-probe-fields.ts";

export async function runPostCreateInteractiveFlow(ctx: AtriumCliContext): Promise<void> {
  const obp = new OBPPersistenceClient({ ledgerSeq: createMonotonicLedgerSeq() });
  const result = await runLinearObpFlow({
    obp,
    partyName: "atrium-cli",
    rootOfferType: POST_CREATE_ROOT,
    transitions: postCreateLinearTransitions,
    readLine: ctx.readLine,
  });

  const kind = String(result.bindsByStep.kind?.kind ?? "");
  const body = String(result.bindsByStep.body?.body ?? "");
  const topicsRaw = result.bindsByStep.topics?.topics;
  const titleRaw = result.bindsByStep.title?.title;

  const topics =
    topicsRaw !== undefined && String(topicsRaw).trim().length > 0
      ? String(topicsRaw)
          .split(",")
          .map((s) => normalizeTopicSlug(s.trim()))
          .filter((s) => s.length > 0)
      : undefined;

  const matchKinds = normalizeMatchKindsInput(result.bindsByStep.matchKinds?.kinds);
  const minScoreRaw = result.bindsByStep.minScore?.score;
  const minHitScore = typeof minScoreRaw === "number" ? minScoreRaw : undefined;
  const expiresAtMs = parseExpiresAtMsInput(result.bindsByStep.expiresAt?.expires);

  const raw = {
    body,
    ...(titleRaw !== undefined && String(titleRaw).trim().length > 0
      ? { title: String(titleRaw).trim() }
      : {}),
    ...(topics !== undefined && topics.length > 0 ? { topics } : {}),
    ...(kind.length > 0 ? { kind } : {}),
    ...(matchKinds !== undefined ? { matchPostKinds: matchKinds } : {}),
    ...(minHitScore !== undefined ? { minHitScore } : {}),
    ...(expiresAtMs !== undefined ? { expiresAtMs } : {}),
  };

  const createBody = zAtriumPostCreate.parse(raw);
  const post = await ctx.client.createPost(createBody);
  console.log(JSON.stringify(post, null, 2));
}
