import { Render } from "@renderinc/sdk";
import type { BeliefIntegrationParams } from "../../../../shared/belief-integration.js";
import { logger } from "../logger.js";

export type { BeliefIntegrationParams };

export async function dispatchBeliefIntegration(params: BeliefIntegrationParams): Promise<void> {
  const apiKey = process.env.RENDER_API_KEY?.trim();
  const slug = process.env.RENDER_WORKFLOW_SLUG?.trim();
  if (apiKey === undefined || apiKey.length === 0 || slug === undefined || slug.length === 0) {
    logger.warn("belief integration skipped: RENDER_API_KEY or RENDER_WORKFLOW_SLUG not set");
    return;
  }

  const render = new Render({ token: apiKey });
  await render.workflows.startTask(`${slug}/integrateBelief`, [params]);
}
