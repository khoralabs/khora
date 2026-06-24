import type { BeliefIntegrationParams } from "@khoralabs/exedra-workflows-integrate-memory/belief-integration";
import { logger } from "../logger.js";
import { createRenderWorkflowClient } from "../render-local.js";

export type { BeliefIntegrationParams };

export async function dispatchBeliefIntegration(params: BeliefIntegrationParams): Promise<void> {
  const slug = process.env.RENDER_INTEGRATION_WORKFLOW_SLUG?.trim();
  const render = createRenderWorkflowClient({ localDevUrlEnv: "RENDER_INTEGRATION_LOCAL_DEV_URL" });
  if (slug === undefined || slug.length === 0 || render === null) {
    logger.warn(
      "belief integration skipped: RENDER_INTEGRATION_WORKFLOW_SLUG or workflow client not configured",
    );
    return;
  }

  await render.workflows.startTask(`${slug}/integrateBelief`, [params]);
}
