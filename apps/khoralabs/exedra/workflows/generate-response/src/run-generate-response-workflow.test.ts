import { beforeEach, expect, test } from "bun:test";
import { createChatService } from "@khoralabs/chat-core";
import { MemoryChatPersistence } from "@khoralabs/chat-persistence";
import type { UIMessage } from "ai";

import type { AuthzClient } from "./authz-client.ts";
import {
  type RunGenerateResponseDependencies,
  runGenerateResponseWorkflow,
} from "./run-generate-response-workflow.ts";
import type { GenerateResponseWorkflowParams } from "./types.ts";

beforeEach(() => {
  process.env.AI_GATEWAY_API_KEY = "test-gateway-key";
});

async function createThread() {
  const service = createChatService(new MemoryChatPersistence());
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

function params(kind: GenerateResponseWorkflowParams["kind"]): GenerateResponseWorkflowParams {
  return {
    responseId: `response-${kind}`,
    kind,
    agent: {
      id: `agent-${kind}`,
      name: "Generate Response Agent",
      actingFor: { type: "agent", id: `agent-${kind}` },
    },
    model: {
      id: "anthropic/claude-sonnet-4.6",
      maxSteps: 3,
    },
    context: {
      sessionId: "session-1",
      threadId: "thread-1",
      userId: "user-1",
      orgId: "org-1",
      teamId: "team-1",
      messages: [userMessage(`Please respond for ${kind}`)],
      instructions: ["Keep the response concise."],
    },
    access: {
      memoryNamespaces: [
        {
          namespace: "org:org-1",
          scope: "org",
          resourceType: "org",
          resourceId: "org-1",
        },
      ],
      documentIds: ["doc-1"],
      chatThread: { threadId: "thread-1", write: true },
    },
    output: {
      mode: kind === "thread_summary" ? "summary" : "message",
      chat: {
        threadId: "thread-1",
        streamDeltas: true,
      },
    },
  };
}

function streamTextMock(text: string): RunGenerateResponseDependencies["streamTextFn"] {
  return (() => ({
    textStream: (async function* () {
      for (const chunk of text.split(" ")) {
        yield `${chunk} `;
      }
    })(),
    finishReason: Promise.resolve("stop"),
    usage: Promise.resolve({
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    }),
    response: Promise.resolve({ provider: "anthropic", modelId: "claude-sonnet-4.6" }),
  })) as unknown as RunGenerateResponseDependencies["streamTextFn"];
}

function authz(overrides: Partial<AuthzClient> = {}): AuthzClient {
  return {
    canReadMemoryNamespace: async () => true,
    canReadDocument: async () => true,
    canWriteChatThread: async () => true,
    ...overrides,
  };
}

test("streams an interview response into chat and returns capability hashes", async () => {
  const { service, thread } = await createThread();
  const result = await runGenerateResponseWorkflow(params("interview"), {
    authzClient: authz(),
    chatService: service,
    memoryClient: {
      searchMemories: async () => [],
      getMemoryProvenance: async () => null,
    },
    streamTextFn: streamTextMock("Interview response"),
  });

  const post = await service.getPost(result.chat.postId);
  expect(result.kind).toBe("interview");
  expect(result.chat.threadId).toBe(thread.id);
  expect(result.chat.status).toBe("complete");
  expect(result.capabilities.staticHash.length).toBeGreaterThan(0);
  expect(post.model?.gatewayModel).toBe("anthropic/claude-sonnet-4.6");
  expect(post.usage?.totalTokens).toBe(15);
});

test("streams a facilitation response fixture", async () => {
  const { service } = await createThread();
  const result = await runGenerateResponseWorkflow(params("facilitation"), {
    authzClient: authz(),
    chatService: service,
    memoryClient: {
      searchMemories: async () => [],
      getMemoryProvenance: async () => null,
    },
    streamTextFn: streamTextMock("Facilitation response"),
  });

  expect(result.kind).toBe("facilitation");
  expect(result.message?.parts).toContainEqual({ type: "text", text: "Facilitation response " });
});

test("streams a thread summary fixture and returns summary text", async () => {
  const { service } = await createThread();
  const result = await runGenerateResponseWorkflow(params("thread_summary"), {
    authzClient: authz(),
    chatService: service,
    memoryClient: {
      searchMemories: async () => [],
      getMemoryProvenance: async () => null,
    },
    streamTextFn: streamTextMock("Thread summary"),
  });

  expect(result.kind).toBe("thread_summary");
  expect(result.summary).toBe("Thread summary ");
});

test("denied chat write access prevents starting a streamed post", async () => {
  const { service } = await createThread();
  await expect(
    runGenerateResponseWorkflow(params("interview"), {
      authzClient: authz({ canWriteChatThread: async () => false }),
      chatService: service,
      memoryClient: {
        searchMemories: async () => [],
        getMemoryProvenance: async () => null,
      },
      streamTextFn: streamTextMock("nope"),
    }),
  ).rejects.toThrow("not authorized to write chat thread");
});

test("denied memory namespaces are pruned before capability capture", async () => {
  const { service } = await createThread();
  const result = await runGenerateResponseWorkflow(params("interview"), {
    authzClient: authz({ canReadMemoryNamespace: async () => false }),
    chatService: service,
    memoryClient: {
      searchMemories: async () => {
        throw new Error("memory search should not be exposed");
      },
      getMemoryProvenance: async () => null,
    },
    streamTextFn: streamTextMock("No memories"),
  });

  expect(result.capabilities.toolRefs).toEqual([]);
});
