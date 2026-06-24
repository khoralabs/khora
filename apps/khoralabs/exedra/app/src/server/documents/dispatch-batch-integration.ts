import type { Database } from "bun:sqlite";
import type { BatchIntegrationParams } from "@khoralabs/exedra-workflows-process-document/document-processing";
import { Render } from "@renderinc/sdk";
import { logger } from "../logger.js";
import { listDocumentsByBatch, patchDocument } from "./db.js";

export type { BatchIntegrationParams };

export async function dispatchBatchIntegration(
  params: BatchIntegrationParams,
): Promise<string | null> {
  const apiKey = process.env.RENDER_API_KEY?.trim();
  const slug = process.env.RENDER_INTEGRATION_WORKFLOW_SLUG?.trim();
  if (apiKey === undefined || apiKey.length === 0 || slug === undefined || slug.length === 0) {
    logger.warn(
      "batch integration skipped: RENDER_API_KEY or RENDER_INTEGRATION_WORKFLOW_SLUG not set",
    );
    return null;
  }

  const render = new Render({ token: apiKey });
  const startedRun = await render.workflows.startTask(`${slug}/integrateBatch`, [params]);
  return startedRun.taskRunId;
}

export async function dispatchBatchIntegrationForDocuments(args: {
  db: Database;
  batchId: string;
  params: BatchIntegrationParams;
}): Promise<void> {
  const taskRunId = await dispatchBatchIntegration(args.params).catch((err) => {
    logger.error({ err, batchId: args.batchId }, "batch integration dispatch failed");
    return null;
  });

  const documents = listDocumentsByBatch(args.db, args.batchId);
  for (const document of documents) {
    patchDocument(args.db, document.id, {
      status: "processing",
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
