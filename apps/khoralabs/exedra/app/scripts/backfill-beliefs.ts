/**
 * Re-integrate belief_feedback rows saved with nanoid IDs (no ':') before the belief-text PATCH fix.
 *
 * Run from repo root:
 *   bun apps/khoralabs/exedra/app/scripts/backfill-beliefs.ts
 */
import { closeDb, getDb } from "../src/server/db/index";
import { loadThreadMessages } from "../src/server/db/messages";
import { logger } from "../src/server/logger";
import { integrateBelief } from "../src/server/memories/integrate-belief";

type BeliefFlagMetadata = {
  beliefFlags?: { belief: string; messageId: string }[];
};

type AffectedRow = {
  thread_id: string;
  belief_id: string;
  source_message_id: string;
  feedback: "confirmed" | "corrected";
  correction: string | null;
  session_id: string;
  user_id: string | null;
};

function resolveBeliefTextsBySourceMessage(threadId: string, sourceMessageId: string): string[] {
  const db = getDb();
  const messages = loadThreadMessages(db, threadId);
  const texts: string[] = [];
  for (const message of messages) {
    const metadata = message.metadata as BeliefFlagMetadata | undefined;
    for (const flag of metadata?.beliefFlags ?? []) {
      if (flag.messageId !== sourceMessageId) continue;
      const text = flag.belief.trim();
      if (text.length > 0) texts.push(text);
    }
  }
  return texts;
}

async function backfillBeliefs(): Promise<void> {
  const db = getDb();
  const affected = db
    .query<AffectedRow, []>(
      `SELECT bf.thread_id, bf.belief_id, bf.source_message_id,
              bf.feedback, bf.correction,
              t.session_id AS session_id, t.user_id
       FROM belief_feedback bf
       JOIN threads t ON bf.thread_id = t.id
       WHERE bf.belief_id NOT LIKE '%:%'
       ORDER BY bf.updated_at_ms ASC`,
    )
    .all();

  logger.info({ count: affected.length }, "backfill: found affected belief_feedback rows");

  let integrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of affected) {
    if (row.user_id === null) {
      logger.warn(
        { beliefId: row.belief_id, threadId: row.thread_id },
        "backfill: skip row without user_id",
      );
      skipped++;
      continue;
    }

    try {
      if (row.feedback === "corrected") {
        const correction = row.correction?.trim() ?? "";
        if (correction.length === 0) {
          logger.warn(
            { beliefId: row.belief_id },
            "backfill: skip corrected row without correction text",
          );
          skipped++;
          continue;
        }

        await integrateBelief({
          db,
          userId: row.user_id,
          threadId: row.thread_id,
          sessionId: row.session_id,
          beliefId: row.belief_id,
          feedback: "corrected",
          correction,
        });
        integrated++;
        continue;
      }

      const beliefs = resolveBeliefTextsBySourceMessage(row.thread_id, row.source_message_id);
      if (beliefs.length === 0) {
        logger.warn(
          { beliefId: row.belief_id, sourceMessageId: row.source_message_id },
          "backfill: skip confirmed row with no matching belief text",
        );
        skipped++;
        continue;
      }

      for (const belief of beliefs) {
        await integrateBelief({
          db,
          userId: row.user_id,
          threadId: row.thread_id,
          sessionId: row.session_id,
          beliefId: row.belief_id,
          belief,
          feedback: "confirmed",
        });
      }
      integrated++;
    } catch (err) {
      failed++;
      logger.error({ err, beliefId: row.belief_id }, "backfill: integration failed");
    }
  }

  logger.info({ integrated, skipped, failed }, "backfill: complete");
}

try {
  await backfillBeliefs();
} finally {
  closeDb();
}
