import type { Database } from "bun:sqlite";
import type { BatchIntegrationParams } from "@khoralabs/exedra-workflows-process-document/document-processing";
import { logger } from "../logger.js";
import { createRenderWorkflowClient } from "../render-local.js";
import { listDocumentsByBatch, patchDocument } from "./db.js";

export type { BatchIntegrationParams };

export async function dispatchBatchIntegration(
  params: BatchIntegrationParams,
): Promise<string | null> {
  const slug = process.env.RENDER_INTEGRATION_WORKFLOW_SLUG?.trim();
  const render = createRenderWorkflowClient({ localDevUrlEnv: "RENDER_INTEGRATION_LOCAL_DEV_URL" });
  if (slug === undefined || slug.length === 0 || render === null) {
    logger.warn(
      "batch integration skipped: RENDER_INTEGRATION_WORKFLOW_SLUG or workflow client not configured",
    );
    return null;
  }

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

  const render = createRenderWorkflowClient({ localDevUrlEnv: "RENDER_INTEGRATION_LOCAL_DEV_URL" });
  if (render === null) return;
  await render.workflows.cancelTaskRun(taskRunId).catch(() => undefined);
}
