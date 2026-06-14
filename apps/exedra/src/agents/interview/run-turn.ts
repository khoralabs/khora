import {
  type AgentRegistry,
  captureAgentSnapshotEnvelope,
  type PolicyResultMap,
} from "@khoralabs/agent-capabilities";
import { toolMapToAiTools } from "@khoralabs/agent-capabilities-ai-sdk";
import {
  convertToModelMessages,
  type LanguageModel,
  type ModelMessage,
  streamText,
  type Tool,
  type ToolSet,
  type UIMessage,
} from "ai";

type InterviewToolSet = Record<string, Tool<unknown, unknown>> & ToolSet;

import type { InterviewSessionMeta } from "./instructions.js";
import { ensureInterviewAgentRegistered } from "./session.js";
import type { InterviewEnv } from "./toolkit.js";

export async function runInterviewTurn(args: {
  registry: AgentRegistry;
  model: LanguageModel;
  sessionId: string;
  sessionMeta: InterviewSessionMeta;
  threadId: string;
  userMessageId: string;
  history: UIMessage[];
  onTextDelta: (delta: string) => void;
  onBeliefFlag: (belief: string, sourceMessageId: string) => void;
}): Promise<{
  assistantParts: UIMessage["parts"];
  beliefFlags: { belief: string; messageId: string }[];
}> {
  const {
    registry,
    model,
    sessionId,
    sessionMeta,
    threadId,
    userMessageId,
    history,
    onTextDelta,
    onBeliefFlag,
  } = args;

  const beliefFlags: { belief: string; messageId: string }[] = [];
  const env: InterviewEnv = {
    sourceMessageId: userMessageId,
    onBeliefFlag: (belief, sourceMessageId) => {
      beliefFlags.push({ belief, messageId: sourceMessageId });
      onBeliefFlag(belief, sourceMessageId);
    },
  };

  const { identity } = await ensureInterviewAgentRegistered(registry, sessionId, sessionMeta);
  const agentId = identity.agentId;

  const toolkitCtx = {
    env,
    agentId,
    agentName: identity.name,
  };

  const capture = await captureAgentSnapshotEnvelope({
    agent: identity,
    ctx: toolkitCtx,
    invocationContext: { threadId, userMessageId },
  });

  const resolvedPolicies: PolicyResultMap = new Map();
  const runtime = {
    ...toolkitCtx,
    resolvedPolicies,
  };
  const aiTools = toolMapToAiTools(capture.evaluatedTools, runtime) as InterviewToolSet;

  let modelMessages: ModelMessage[];
  try {
    modelMessages = await convertToModelMessages(history);
  } catch {
    modelMessages = history.map((m) => ({
      role: m.role,
      content: m.parts
        .filter((p) => p.type === "text")
        .map((p) => (p as { type: "text"; text: string }).text)
        .join(""),
    }));
  }

  const assistantParts: UIMessage["parts"] = [];
  const result = streamText({
    model,
    system: capture.instructions,
    messages: modelMessages,
    tools: aiTools,
  });

  for await (const part of result.fullStream) {
    if (part.type === "text-delta") {
      const delta = part.text;
      if (delta.length === 0) continue;
      const last = assistantParts.at(-1);
      if (last !== undefined && last.type === "text") {
        last.text += delta;
      } else {
        assistantParts.push({ type: "text", text: delta });
      }
      onTextDelta(delta);
    }
  }

  return { assistantParts, beliefFlags };
}
