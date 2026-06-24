import { beforeEach, expect, test } from "bun:test";
import { createChatService } from "@khoralabs/chat-core";
import { MemoryChatPersistence } from "@khoralabs/chat-persistence";
import type { UIMessage } from "ai";
import { CONVERSATIONAL_AGENT_ID } from "./agents/conversational/identity.ts";
import { defineGenerateResponseAgent } from "./agents/index.ts";
import type { AuthzClient } from "./authz-client.ts";
import {
  type RunGenerateResponseDependencies,
  runGenerateResponseWorkflow,
} from "./run-generate-response-workflow.ts";
import { discoverBundledSkills } from "./skills/registry.ts";
import { activateSkillByName } from "./tools/activate-skill.ts";
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

function params(input: {
  responseId: string;
  skillNames: string[];
  mode?: GenerateResponseWorkflowParams["output"]["mode"];
  instructions?: string[];
}): GenerateResponseWorkflowParams {
  return {
    responseId: input.responseId,
    agent: {
      id: "agent-generic",
      name: "Generate Response Agent",
      actingFor: { type: "agent", id: "agent-generic" },
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
      messages: [userMessage(`Please respond using ${input.skillNames.join(", ")}`)],
      directives: {
        skillNames: input.skillNames,
        instructions: input.instructions ?? ["Keep the response concise."],
        userTimeZone: "America/New_York",
      },
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
      mode: input.mode ?? "message",
      chat: {
        threadId: "thread-1",
        streamDeltas: true,
      },
    },
  };
}

function streamTextMock(
  text: string,
  seen: Array<{ system?: string; stopWhen?: unknown }> = [],
): RunGenerateResponseDependencies["streamTextFn"] {
  return ((input: { system?: string; stopWhen?: unknown }) => {
    seen.push({ system: input.system, stopWhen: input.stopWhen });
    return {
      textStream: (async function* () {
        for (const chunk of text.split(" ")) {
          yield `${chunk} `;
        }
      })(),
      text: Promise.resolve(`${text} `),
      finishReason: Promise.resolve("stop"),
      usage: Promise.resolve({
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
      }),
      response: Promise.resolve({ provider: "anthropic", modelId: "claude-sonnet-4.6" }),
    };
  }) as unknown as RunGenerateResponseDependencies["streamTextFn"];
}

function authz(overrides: Partial<AuthzClient> = {}): AuthzClient {
  return {
    canReadMemoryNamespace: async () => true,
    canReadDocument: async () => true,
    canWriteChatThread: async () => true,
    ...overrides,
  };
}

test("uses one generic registered agent identity with skills in the static hash", async () => {
  const skills = await discoverBundledSkills();
  const generic = await defineGenerateResponseAgent(skills);
  const withoutSummary = await defineGenerateResponseAgent(
    skills.filter((skill) => skill.name !== "summarize-thread"),
  );

  expect(generic.agent.agentId).toBe(CONVERSATIONAL_AGENT_ID);
  expect(withoutSummary.agent.agentId).toBe(CONVERSATIONAL_AGENT_ID);
  expect(generic.staticHash).not.toBe(withoutSummary.staticHash);
});

test("streams an interview response into chat and returns capability hashes", async () => {
  const { service, thread } = await createThread();
  const seen: Array<{ system?: string }> = [];
  const result = await runGenerateResponseWorkflow(
    params({
      responseId: "response-interview",
      skillNames: ["conduct-interview"],
    }),
    {
      authzClient: authz(),
      chatService: service,
      memoryClient: {
        searchMemories: async () => [],
        getMemoryProvenance: async () => null,
      },
      streamTextFn: streamTextMock("Interview response", seen),
    },
  );

  const post = await service.getPost(result.chat.postId);
  expect(result.chat.threadId).toBe(thread.id);
  expect(result.chat.status).toBe("complete");
  expect(result.capabilities.staticHash.length).toBeGreaterThan(0);
  expect(post.model?.gatewayModel).toBe("anthropic/claude-sonnet-4.6");
  expect(post.usage?.totalTokens).toBe(15);
  expect(seen[0].system).toContain('<skill_content name="conduct-interview">');
  expect(seen[0].system).toContain("The stakeholder's current local date and time");
});

test("uses stopWhen stepCountIs for multi-step tool loops", async () => {
  const { service } = await createThread();
  const seen: Array<{ system?: string; stopWhen?: unknown }> = [];
  await runGenerateResponseWorkflow(
    params({
      responseId: "response-stop-when",
      skillNames: ["conduct-interview"],
    }),
    {
      authzClient: authz(),
      chatService: service,
      memoryClient: {
        searchMemories: async () => [],
        getMemoryProvenance: async () => null,
      },
      streamTextFn: streamTextMock("Interview response", seen),
    },
  );

  expect(seen[0]?.stopWhen).toBeDefined();
});

test("can generate the opening response for an empty thread", async () => {
  const { service } = await createThread();
  const input = params({
    responseId: "response-empty-thread",
    skillNames: ["conduct-interview"],
  });
  input.context.messages = [];

  const result = await runGenerateResponseWorkflow(input, {
    authzClient: authz(),
    chatService: service,
    memoryClient: {
      searchMemories: async () => [],
      getMemoryProvenance: async () => null,
    },
    streamTextFn: streamTextMock("Opening question"),
  });

  expect(result.message?.parts).toContainEqual({ type: "text", text: "Opening question " });
});

test("fails when the model produces no text output", async () => {
  const { service } = await createThread();
  await expect(
    runGenerateResponseWorkflow(
      params({
        responseId: "response-empty",
        skillNames: ["conduct-interview"],
      }),
      {
        authzClient: authz(),
        chatService: service,
        memoryClient: {
          searchMemories: async () => [],
          getMemoryProvenance: async () => null,
        },
        streamTextFn: (() =>
          ({
            textStream: (async function* () {})(),
            text: Promise.resolve(""),
            finishReason: Promise.reject(new Error("No output generated")),
            usage: Promise.resolve(undefined),
            response: Promise.resolve(undefined),
          }) as unknown as Awaited<
            ReturnType<NonNullable<RunGenerateResponseDependencies["streamTextFn"]>>
          >) as RunGenerateResponseDependencies["streamTextFn"],
      },
    ),
  ).rejects.toThrow("generate response produced no text output");

  const post = await service.getPost("response-empty");
  expect(post.parts).toEqual([
    { type: "text", text: "I couldn't generate a response. Please try again." },
  ]);
});

test("default writer sends streamed post operations through Exedra internal chat API", async () => {
  const calls: Array<{ path: string; body: unknown }> = [];
  let revision = 0;
  let latestMessage: UIMessage = { id: "response-http", role: "assistant", parts: [] };
  const exedraClient = {
    get: async () => {
      throw new Error("unexpected GET");
    },
    post: async <T>(path: string, body: unknown): Promise<T> => {
      calls.push({ path, body });
      if (path.endsWith("/streamed-posts")) {
        revision = 1;
        latestMessage = (body as { message: UIMessage }).message;
        return { post: latestMessage, revision } as T;
      }
      if (path.endsWith("/deltas")) {
        revision += 1;
        latestMessage = (body as { message: UIMessage }).message;
        return { post: latestMessage, revision } as T;
      }
      if (path.endsWith("/complete")) {
        return { post: latestMessage } as T;
      }
      if (path.endsWith("/abort")) {
        return { post: latestMessage } as T;
      }
      throw new Error(`unexpected POST ${path}`);
    },
  };

  const result = await runGenerateResponseWorkflow(
    params({
      responseId: "response-http",
      skillNames: ["conduct-interview"],
    }),
    {
      authzClient: authz(),
      exedraClient,
      memoryClient: {
        searchMemories: async () => [],
        getMemoryProvenance: async () => null,
      },
      streamTextFn: streamTextMock("HTTP response"),
    },
  );

  expect(result.chat.postId).toBe("response-http");
  expect(result.message?.parts).toContainEqual({ type: "text", text: "HTTP response " });
  expect(calls.map((call) => call.path)).toContain("/internal/chat/streamed-posts");
  expect(calls[0]?.body).toMatchObject({ threadId: "thread-1" });
  expect(calls.some((call) => call.path === "/internal/chat/posts/response-http/deltas")).toBe(
    true,
  );
  expect(calls.map((call) => call.path)).toContain("/internal/chat/posts/response-http/complete");
});

test("discloses only selected skill catalog and not unselected skill bodies", async () => {
  const { service } = await createThread();
  const seen: Array<{ system?: string }> = [];
  const result = await runGenerateResponseWorkflow(
    params({
      responseId: "response-facilitate",
      skillNames: ["facilitate-conversation"],
    }),
    {
      authzClient: authz(),
      chatService: service,
      memoryClient: {
        searchMemories: async () => [],
        getMemoryProvenance: async () => null,
      },
      streamTextFn: streamTextMock("Facilitation response", seen),
    },
  );

  expect(result.message?.parts).toContainEqual({ type: "text", text: "Facilitation response " });
  expect(seen[0].system).toContain("<name>facilitate-conversation</name>");
  expect(seen[0].system).not.toContain("<name>conduct-interview</name>");
  expect(seen[0].system).not.toContain('<skill_content name="conduct-interview">');
});

test("activateSkill returns structured content and dedupes repeated activation", async () => {
  const skills = await discoverBundledSkills();
  const env = {
    policyState: {
      memoryNamespaces: [],
      documentIds: [],
      canWriteChatThread: true,
      skillNames: ["summarize-thread"],
      flags: {},
    },
    memoryClient: {
      searchMemories: async () => [],
      getMemoryProvenance: async () => null,
    },
    skills: skills.filter((skill) => skill.name === "summarize-thread"),
    activatedSkillNames: new Set<string>(),
  };

  const first = activateSkillByName(env, "summarize-thread");
  const second = activateSkillByName(env, "summarize-thread");

  expect(first.alreadyActive).toBe(false);
  expect(first.content).toContain('<skill_content name="summarize-thread">');
  expect(second).toEqual({ name: "summarize-thread", alreadyActive: true });
});

test("streams a thread summary fixture and returns summary text", async () => {
  const { service } = await createThread();
  const result = await runGenerateResponseWorkflow(
    params({
      responseId: "response-summary",
      skillNames: ["summarize-thread"],
      mode: "summary",
    }),
    {
      authzClient: authz(),
      chatService: service,
      memoryClient: {
        searchMemories: async () => [],
        getMemoryProvenance: async () => null,
      },
      streamTextFn: streamTextMock("Thread summary"),
    },
  );

  expect(result.summary).toBe("Thread summary ");
});

test("unknown skill directives fail clearly", async () => {
  const { service } = await createThread();
  await expect(
    runGenerateResponseWorkflow(
      params({
        responseId: "response-unknown-skill",
        skillNames: ["missing-skill"],
      }),
      {
        authzClient: authz(),
        chatService: service,
        memoryClient: {
          searchMemories: async () => [],
          getMemoryProvenance: async () => null,
        },
        streamTextFn: streamTextMock("nope"),
      },
    ),
  ).rejects.toThrow("unknown skill directive: missing-skill");
});

test("denied chat write access prevents starting a streamed post", async () => {
  const { service } = await createThread();
  await expect(
    runGenerateResponseWorkflow(
      params({
        responseId: "response-denied-chat",
        skillNames: ["conduct-interview"],
      }),
      {
        authzClient: authz({ canWriteChatThread: async () => false }),
        chatService: service,
        memoryClient: {
          searchMemories: async () => [],
          getMemoryProvenance: async () => null,
        },
        streamTextFn: streamTextMock("nope"),
      },
    ),
  ).rejects.toThrow("not authorized to write chat thread");
});

test("denied memory namespaces are pruned before capability capture", async () => {
  const { service } = await createThread();
  const result = await runGenerateResponseWorkflow(
    params({
      responseId: "response-denied-memory",
      skillNames: ["conduct-interview"],
    }),
    {
      authzClient: authz({ canReadMemoryNamespace: async () => false }),
      chatService: service,
      memoryClient: {
        searchMemories: async () => {
          throw new Error("memory search should not be exposed");
        },
        getMemoryProvenance: async () => null,
      },
      streamTextFn: streamTextMock("No memories"),
    },
  );

  expect(result.capabilities.toolRefs.map((toolRef) => toolRef.toolKey)).toEqual(["activateSkill"]);
});
