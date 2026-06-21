import { type AgentTelemetry, createAgentTelemetry } from "@khoralabs/agent-capabilities-otel";
import { createMemoriesAgentTelemetry } from "@khoralabs/memories-tools";

import { logger } from "../logger.js";
import { meter, tracer } from "../otel.js";

export type { AgentTelemetry };

const otelDeps = { tracer, logger, meter };

/** Interview and other non-memories agents. */
export function createExedraAgentTelemetry(): AgentTelemetry {
  return createAgentTelemetry(otelDeps);
}

/** Memories agents — binds provenance head into Pino; clients wrap hooks via memoryAgentSessionHooks. */
export async function createExedraMemoriesAgentTelemetry(client: {
  persistence: {
    getProvenanceHeadRootHex?: () => string | undefined | Promise<string | undefined>;
  };
}): Promise<AgentTelemetry> {
  return createMemoriesAgentTelemetry({ client, ...otelDeps });
}
