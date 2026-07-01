import {
  type AgentRegistry,
  captureAgentSnapshotEnvelope,
  createAgentRegistry,
  type RegisteredAgent,
} from "@khoralabs/agent-capabilities";
import { toolMapToAiTools } from "@khoralabs/agent-capabilities-ai-sdk";
import { type AgentTelemetry, createAgentTelemetry } from "@khoralabs/agent-capabilities-otel";
import { createLogger } from "@khoralabs/observability/logger";

import { defineHarnessAgent } from "./agents/index.ts";
import { meter, tracer } from "./otel.ts";
import type { HarnessToolkitEnv } from "./tools/types.ts";
import type { AgentWorkflowParams } from "./types.ts";

type CaptureEnvelope = Awaited<ReturnType<typeof captureAgentSnapshotEnvelope>>;

let agentRegistry: AgentRegistry | undefined;

const logger = createLogger({ name: "network-harness-agent" });
const otelDeps = { tracer, logger, meter };

export function getAgentRegistry(): AgentRegistry {
  if (agentRegistry === undefined) agentRegistry = createAgentRegistry();
  return agentRegistry;
}

export function createHarnessAgentTelemetry(): AgentTelemetry {
  return createAgentTelemetry(otelDeps);
}

export function resolveGatewayModel(modelId: string): string {
  const id = modelId.trim() || process.env.AGENT_DEFAULT_MODEL?.trim();
  if (id === undefined || id.length === 0) throw new Error("model.id is required");
  if (!process.env.AI_GATEWAY_API_KEY?.trim()) {
    throw new Error("AI_GATEWAY_API_KEY environment variable not set");
  }
  return id;
}

export async function registerHarnessAgent(
  registry: AgentRegistry,
): Promise<{ staticHash: string; agent: RegisteredAgent }> {
  const defined = await defineHarnessAgent();
  if (registry.has(defined.agent.agentId)) {
    const entry = registry.get(defined.agent.agentId);
    if (entry === undefined) throw new Error(`registry inconsistency for ${defined.agent.agentId}`);
    return { staticHash: entry.agent.staticHash, agent: entry.agent };
  }
  await registry.register(defined.agent);
  return defined;
}

export async function resolveWorkflowAgent(
  registry: AgentRegistry,
  agentId: string,
  opts?: { sessionId?: string; swarmDataDir?: string },
): Promise<{ staticHash: string; agent: RegisteredAgent }> {
  if (registry.has(agentId)) {
    const entry = registry.get(agentId);
    if (entry === undefined) throw new Error(`registry inconsistency for ${agentId}`);
    return { staticHash: entry.agent.staticHash, agent: entry.agent };
  }

  const sessionId = opts?.sessionId?.trim();
  const swarmDataDir = opts?.swarmDataDir?.trim();
  if (
    sessionId !== undefined &&
    sessionId.length > 0 &&
    swarmDataDir !== undefined &&
    swarmDataDir.length > 0
  ) {
    const { ensureSwarmAgentRegistered } = await import("../swarm/agent-registry.ts");
    await ensureSwarmAgentRegistered(registry, swarmDataDir, sessionId, agentId);
    if (registry.has(agentId)) {
      const entry = registry.get(agentId);
      if (entry === undefined) throw new Error(`registry inconsistency for ${agentId}`);
      return { staticHash: entry.agent.staticHash, agent: entry.agent };
    }
  }

  return registerHarnessAgent(registry);
}

export async function captureHarnessCapabilities(input: {
  agent: RegisteredAgent;
  env: HarnessToolkitEnv;
  params: AgentWorkflowParams;
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
    invocationContext: { runId: input.params.runId },
    sessionContext: {
      sessionId: input.params.context.sessionId ?? input.params.runId,
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
