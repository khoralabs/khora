import { beforeEach, expect, test } from "bun:test";
import { createChatService } from "@khoralabs/chat-core";
import {
  createChatDatabase,
  createSqliteChatPersistence,
} from "@khoralabs/chat-persistence-sqlite";
import type { UIMessage } from "ai";

import { HARNESS_AGENT_ID } from "./agents/index.ts";
import { runAgentWorkflow } from "./run-agent-workflow.ts";
import type { AgentWorkflowParams } from "./types.ts";

beforeEach(() => {
  process.env.AI_GATEWAY_API_KEY = process.env.AI_GATEWAY_API_KEY ?? "";
});

async function createThread() {
  const service = createChatService(createSqliteChatPersistence(createChatDatabase()));
  const channel = await service.createChannel({ id: "channel-1" });
  const thread = await service.createThread({
    id: "thread-1",
    root: { type: "channel", channelId: channel.id },
  });
  return { service, thread };
}

function userMessage(text: string): UIMessage {
  return {
    id: "user-message-1",
    role: "user",
    parts: [{ type: "text", text }],
  };
}

function params(input: { runId: string; text: string }): AgentWorkflowParams {
  return {
    runId: input.runId,
    agent: {
      id: HARNESS_AGENT_ID,
      name: "Network Harness Agent",
      actingFor: { type: "agent", id: HARNESS_AGENT_ID },
    },
    model: {
      id: "anthropic/claude-sonnet-4.6",
      maxSteps: 3,
    },
    context: {
      sessionId: "session-1",
      threadId: "thread-1",
      messages: [userMessage(input.text)],
      instructions: ["Keep the response concise."],
    },
    output: {
      chat: {
        threadId: "thread-1",
        streamDeltas: false,
      },
    },
  };
}

test("runAgentWorkflow streams assistant text to chat thread", async () => {
  const { service, thread } = await createThread();
  const chunks = ["Hello", " from", " harness."];

  const result = await runAgentWorkflow(params({ runId: "run-1", text: "Say hello" }), {
    chatService: service,
    streamTextFn: (() => ({
      textStream: (async function* () {
        for (const chunk of chunks) yield chunk;
      })(),
      text: Promise.resolve(chunks.join("")),
      finishReason: Promise.resolve("stop"),
      usage: Promise.resolve({
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
      }),
      response: Promise.resolve({
        modelId: "anthropic/claude-sonnet-4.6",
        provider: "gateway",
      }),
    })) as unknown as typeof import("ai").streamText,
  });

  expect(result.chat.status).toBe("complete");
  expect(result.chat.threadId).toBe(thread.id);
  expect(
    result.message?.parts.some((part) => part.type === "text" && part.text === chunks.join("")),
  ).toBe(true);

  const posts = await service.listPosts({ threadId: thread.id });
  expect(posts.items.some((post) => post.role === "assistant")).toBe(true);
});

test("resolveGatewayModel requires AI_GATEWAY_API_KEY", async () => {
  delete process.env.AI_GATEWAY_API_KEY;
  const { service } = await createThread();

  await expect(
    runAgentWorkflow(params({ runId: "run-2", text: "Hi" }), {
      chatService: service,
    }),
  ).rejects.toThrow("AI_GATEWAY_API_KEY");
});
