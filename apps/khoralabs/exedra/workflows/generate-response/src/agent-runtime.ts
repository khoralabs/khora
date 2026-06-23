import {
  type AgentRegistry,
  captureAgentSnapshotEnvelope,
  createAgentRegistry,
  createRegisteredAgent,
  type RegisteredAgent,
} from "@khoralabs/agent-capabilities";
import { toolMapToAiTools } from "@khoralabs/agent-capabilities-ai-sdk";
import { type AgentTelemetry, createAgentTelemetry } from "@khoralabs/agent-capabilities-otel";
import { createLogger } from "@khoralabs/observability/logger";

import { type GenerateResponseToolkitEnv, memoryToolkit } from "./memory-toolkit.ts";
import { meter, tracer } from "./otel.ts";
import type { GenerateResponseWorkflowParams } from "./types.ts";

type CaptureEnvelope = Awaited<ReturnType<typeof captureAgentSnapshotEnvelope>>;

let agentRegistry: AgentRegistry | undefined;

const logger = createLogger({ name: "exedra-generate-response" });
const otelDeps = { tracer, logger, meter };

export function getAgentRegistry(): AgentRegistry {
  if (agentRegistry === undefined) agentRegistry = createAgentRegistry();
  return agentRegistry;
}

export function createGenerateResponseTelemetry(): AgentTelemetry {
  return createAgentTelemetry(otelDeps);
}

export function resolveGatewayModel(modelId: string): string {
  const id = modelId.trim() || process.env.GENERATE_RESPONSE_DEFAULT_MODEL?.trim();
  if (id === undefined || id.length === 0) throw new Error("model.id is required");
  if (!process.env.AI_GATEWAY_API_KEY?.trim()) {
    throw new Error("AI_GATEWAY_API_KEY environment variable not set");
  }
  return id;
}

export async function defineGenerateResponseAgent(
  params: GenerateResponseWorkflowParams,
  instructions: string[],
): Promise<{ staticHash: string; agent: RegisteredAgent }> {
  const { staticHash, agent } = await createRegisteredAgent({
    agentId: params.agent.id,
    name: params.agent.name,
    instructions,
    context: {
      kind: params.kind,
      responseId: params.responseId,
      sessionId: params.context.sessionId,
      threadId: params.output.chat.threadId,
      actingFor: params.agent.actingFor,
    },
    rootComposable: memoryToolkit,
  });
  return { staticHash, agent };
}

export async function registerGenerateResponseAgent(
  registry: AgentRegistry,
  params: GenerateResponseWorkflowParams,
  instructions: string[],
): Promise<{ staticHash: string; agent: RegisteredAgent }> {
  if (registry.has(params.agent.id)) {
    const entry = registry.get(params.agent.id);
    if (entry === undefined) throw new Error(`registry inconsistency for ${params.agent.id}`);
    return { staticHash: entry.agent.staticHash, agent: entry.agent };
  }
  const defined = await defineGenerateResponseAgent(params, instructions);
  await registry.register(defined.agent);
  return defined;
}

export async function captureGenerateResponseCapabilities(input: {
  agent: RegisteredAgent;
  env: GenerateResponseToolkitEnv;
  params: GenerateResponseWorkflowParams;
}): Promise<{
  capture: CaptureEnvelope;
  aiTools: Record<string, unknown>;
  capabilities: {
    staticHash: string;
    runtimeHash: string;
    invocationHash?: string;
    toolRefs: Array<{ toolKey: string; toolHash: string }>;
    envelopeId?: string;
  };
}> {
  const capture = await captureAgentSnapshotEnvelope({
    agent: input.agent,
    ctx: {
      env: input.env,
      agentId: input.agent.agentId,
      agentName: input.agent.name,
    },
    invocationContext: input.params.context.invocationContext ?? {
      responseId: input.params.responseId,
      kind: input.params.kind,
    },
    sessionContext: input.params.context.sessionContext ?? {
      sessionId: input.params.context.sessionId,
      threadId: input.params.output.chat.threadId,
    },
  });

  const aiTools = toolMapToAiTools(capture.evaluatedTools, {
    env: input.env,
    resolvedPolicies: new Map(),
  }) as Record<string, unknown>;

  return {
    capture,
    aiTools,
    capabilities: {
      staticHash: capture.link.staticHash,
      runtimeHash: capture.link.runtimeHash,
      invocationHash: capture.link.invocationHash,
      toolRefs: capture.toolRefs.map(
        (toolRef: { toolKey?: string; key?: string; toolHash: string }) => ({
          toolKey: toolRef.toolKey ?? toolRef.key ?? "unknown",
          toolHash: toolRef.toolHash,
        }),
      ),
    },
  };
}
