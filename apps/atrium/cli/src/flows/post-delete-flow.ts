import { OBPPersistenceClient } from "@cfd/obp-core";
import type { AtriumCliContext } from "./context.ts";
import { POST_DELETE_ROOT, postDeleteLinearTransitions } from "./graphs/post-delete-linear.ts";
import { createMonotonicLedgerSeq } from "./obp/ledger-seq.ts";
import { runLinearObpFlow } from "./obp/linear-runner.ts";
import { requireAgentDid } from "./require-agent-did.ts";

export async function runPostDeleteInteractiveFlow(
  ctx: AtriumCliContext,
  postId: string,
): Promise<void> {
  const did = requireAgentDid();
  const obp = new OBPPersistenceClient({ ledgerSeq: createMonotonicLedgerSeq() });
  const result = await runLinearObpFlow({
    obp,
    partyName: "atrium-cli",
    rootOfferType: POST_DELETE_ROOT,
    transitions: postDeleteLinearTransitions,
    readLine: ctx.readLine,
  });

  const confirm = String(result.bindsByStep.confirm?.confirmation ?? "").trim();
  if (confirm !== "DELETE") {
    throw new Error('Aborted (expected exact "DELETE").');
  }

  await ctx.client.deletePost(did, postId);
}
