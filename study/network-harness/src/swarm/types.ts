import type { PostUsage } from "@khoralabs/chat-core";

import type { AgentWorkflowResult } from "../agent/types.ts";

export type SwarmConfig = {
  sessionId: string;
  dataDir: string;
  goal: string;
  agentCount: number;
  maxTokenBudget: number;
  contextMessageLimit: number;
  model: { id: string; maxSteps?: number };
  roles: string[];
};

export type AgentLoopState = {
  did: string;
  agentId: string;
  role: string;
  selfThreadId: string;
  registeredStaticHash: string;
  turnCount: number;
};

export type ThreadHashSnapshot = {
  threadId: string;
  headLineageHash: string;
  lastPostContentHash?: string;
};

export type TurnTelemetry = {
  sessionId: string;
  agentTurnIndex: number;
  agentDid: string;
  agentRole: string;
  runId: string;
  usage?: PostUsage;
  capabilities: AgentWorkflowResult["capabilities"];
  memoriesProvenanceRootHex: string;
  threadHashes: ThreadHashSnapshot[];
  inboxEntryIds: string[];
};

export type SwarmState = {
  id: string;
  sessionId: string;
  config: SwarmConfig;
  tokensUsed: number;
  agents: AgentLoopState[];
};

export type AgentLoopResult = {
  did: string;
  turns: number;
};

export type SwarmResult = {
  sessionId: string;
  tokensUsed: number;
  maxTokenBudget: number;
  agentResults: AgentLoopResult[];
};

export type NetworkEventSource = "harness" | "swarm" | "agent" | "inbox" | "chat" | "workflow";

export type NetworkAttribution = {
  staticHash: string;
  runtimeHash: string;
  invocationHash?: string;
  toolRefs: Array<{ toolKey: string; toolHash: string }>;
  memoriesProvenanceRootHex: string;
  threadHashes: ThreadHashSnapshot[];
  attributionDigestHex: string;
};

export type NetworkEvent = {
  eventId: string;
  sessionId: string;
  seq?: number;
  tsMs: number;
  source: NetworkEventSource;
  kind: string;
  level?: "debug" | "info" | "warn" | "error";
  message?: string;
  agentDid?: string;
  agentRole?: string;
  runId?: string;
  payload?: Record<string, unknown>;
  attribution?: NetworkAttribution;
};
