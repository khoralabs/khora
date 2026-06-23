import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { type AgentRegistry, createAgentRegistry } from "@khoralabs/agent-capabilities";
import { type AgentTelemetry, createAgentTelemetry } from "@khoralabs/agent-capabilities-otel";
import { createLogger } from "@khoralabs/observability/logger";
import type { LanguageModel } from "ai";

import { meter, tracer } from "./otel.ts";

let agentRegistry: AgentRegistry | undefined;

const logger = createLogger({ name: "exedra-facilitation-agent" });
const otelDeps = { tracer, logger, meter };

export function getAgentRegistry(): AgentRegistry {
  if (agentRegistry === undefined) agentRegistry = createAgentRegistry();
  return agentRegistry;
}

export function createFacilitationTelemetry(): AgentTelemetry {
  return createAgentTelemetry(otelDeps);
}

export function resolveFacilitationModel(): LanguageModel {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is required");
  }
  const google = createGoogleGenerativeAI({ apiKey });
  return google("gemini-2.5-flash");
}
