import type { Database } from "bun:sqlite";

import { Render } from "@renderinc/sdk";
import type { ProcessDocumentParams } from "../../../../shared/document-processing.js";
import { logger } from "../logger.js";
import { patchSessionDocument } from "./db.js";

export type { ProcessDocumentParams };

export async function dispatchDocumentProcessing(
  params: ProcessDocumentParams,
): Promise<string | null> {
  const apiKey = process.env.RENDER_API_KEY?.trim();
  const slug = process.env.RENDER_DOCUMENT_WORKFLOW_SLUG?.trim();
  if (apiKey === undefined || apiKey.length === 0 || slug === undefined || slug.length === 0) {
    logger.warn(
      "document processing skipped: RENDER_API_KEY or RENDER_DOCUMENT_WORKFLOW_SLUG not set",
    );
    return null;
  }

  const render = new Render({ token: apiKey });
  const startedRun = await render.workflows.startTask(`${slug}/processDocument`, [params]);
  return startedRun.taskRunId;
}

export async function dispatchDocumentProcessingForTurn(args: {
  db: Database;
  documents: readonly { documentId: string }[];
  params: Omit<ProcessDocumentParams, "documentId">;
}): Promise<void> {
  for (const document of args.documents) {
    const taskRunId = await dispatchDocumentProcessing({
      ...args.params,
      documentId: document.documentId,
    }).catch((err) => {
      logger.error({ err, documentId: document.documentId }, "document processing dispatch failed");
      return null;
    });

    patchSessionDocument(args.db, document.documentId, {
      status: "processing",
      turnId: args.params.turnId,
      ...(taskRunId !== null ? { taskRunId } : {}),
    });
  }
}

export async function cancelDocumentProcessingTaskRun(
  taskRunId: string | null | undefined,
): Promise<void> {
  if (taskRunId === null || taskRunId === undefined || taskRunId.length === 0) return;

  const apiKey = process.env.RENDER_API_KEY?.trim();
  if (apiKey === undefined || apiKey.length === 0) return;

  const render = new Render({ token: apiKey });
  await render.workflows.cancelTaskRun(taskRunId).catch(() => undefined);
}
