import { OBPPersistenceClient } from "@khoralabs/obp-core";
import type { AtriumCliContext } from "./context.ts";
import { INBOX_LIST_ROOT, inboxListLinearTransitions } from "./graphs/inbox-list-linear.ts";
import { createMonotonicLedgerSeq } from "./obp/ledger-seq.ts";
import { runLinearObpFlow } from "./obp/linear-runner.ts";

export async function runInboxListInteractiveFlow(ctx: AtriumCliContext): Promise<void> {
  const obp = new OBPPersistenceClient({ ledgerSeq: createMonotonicLedgerSeq() });
  const result = await runLinearObpFlow({
    obp,
    partyName: "atrium-cli",
    rootOfferType: INBOX_LIST_ROOT,
    transitions: inboxListLinearTransitions,
    readLine: ctx.readLine,
  });

  const row = result.bindsByStep.inbox;
  if (row === undefined) {
    throw new Error("inbox: missing bind payload");
  }

  const limitRaw = row.limit;
  const limit =
    limitRaw !== undefined && typeof limitRaw === "number" && Number.isFinite(limitRaw)
      ? Math.floor(limitRaw)
      : undefined;

  const markRead = row["mark-read"] === true;

  const out = await ctx.client.listInbox({
    ...(limit !== undefined ? { limit } : {}),
    ...(markRead ? { markRead: true } : {}),
  });

  console.log(JSON.stringify(out, null, 2));
}
