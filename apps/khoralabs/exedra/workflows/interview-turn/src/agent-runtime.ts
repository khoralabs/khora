import { createOpenAI } from "@ai-sdk/openai";
import { type AgentRegistry, createAgentRegistry } from "@khoralabs/agent-capabilities";
import { type AgentTelemetry, createAgentTelemetry } from "@khoralabs/agent-capabilities-otel";
import { createLogger } from "@khoralabs/observability/logger";
import type { LanguageModel } from "ai";

import { meter, tracer } from "./otel.ts";

let agentRegistry: AgentRegistry | undefined;

const logger = createLogger({ name: "exedra-interview-turn" });
const otelDeps = { tracer, logger, meter };

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} environment variable not set`);
  }
  return value;
}

export function getAgentRegistry(): AgentRegistry {
  if (agentRegistry === undefined) agentRegistry = createAgentRegistry();
  return agentRegistry;
}

export function createInterviewTelemetry(): AgentTelemetry {
  return createAgentTelemetry(otelDeps);
}

export function resolveInterviewModel(): LanguageModel {
  const apiKey = requireEnv("AI_API_KEY");
  const baseURL = process.env.AI_BASE_URL?.trim();
  const modelId = process.env.AI_MODEL?.trim() || "gpt-4o";
  const openai = createOpenAI({
    apiKey,
    ...(baseURL !== undefined && baseURL.length > 0 ? { baseURL } : {}),
  });
  return openai(modelId);
}
