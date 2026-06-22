import { type AgentTelemetry, createAgentTelemetry } from "@khoralabs/agent-capabilities-otel";
import { createMemoriesAgentTelemetry } from "@khoralabs/memories-tools";
import { createLogger } from "@khoralabs/observability/logger";

import { meter, tracer } from "./otel.ts";

export type { AgentTelemetry };

const logger = createLogger({ name: "exedra-investigate-memories" });
const otelDeps = { tracer, logger, meter };

export async function createWorkflowMemoriesAgentTelemetry(client: {
  persistence: {
    getProvenanceHeadRootHex?: () => string | undefined | Promise<string | undefined>;
  };
}): Promise<AgentTelemetry> {
  return createMemoriesAgentTelemetry({ client, ...otelDeps });
}

export function createWorkflowAgentTelemetry(): AgentTelemetry {
  return createAgentTelemetry(otelDeps);
}
