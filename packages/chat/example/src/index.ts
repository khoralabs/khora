import { Database } from "bun:sqlite";
import type { ChatEvent, ChatService, JsonObject } from "@khoralabs/chat-core";
import { ChatNotFoundError, createChatService } from "@khoralabs/chat-core";
import {
  createSqliteChatPersistence,
  ensureChatSqliteSchema,
} from "@khoralabs/chat-persistence-sqlite";
import type { UIMessage } from "ai";
import { serve } from "bun";
import index from "./index.html";

const DEMO_CHANNEL_ID = "chat-demo";
const LIVE_THREAD_ID = "live-tool-loop";
const USER_AUTHOR = { type: "account", id: "demo-user" };
const AGENT_AUTHOR = { type: "agent", id: "tool-loop-agent" };

const dbPath = new URL("../sqlite/chat-demo.sqlite", import.meta.url);
await Bun.$`mkdir -p ${new URL("../sqlite", import.meta.url).pathname}`;

const db = new Database(dbPath.pathname);
ensureChatSqliteSchema(db);
db.run(`
  CREATE TABLE IF NOT EXISTS tool_loop_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at_ms INTEGER NOT NULL
  )
`);

const subscribers = new Map<string, Set<(event: ChatEvent) => void>>();
const chat = createChatService(createSqliteChatPersistence(db), {
  onEvent(event) {
    if (!("threadId" in event)) return;
    for (const send of subscribers.get(event.threadId) ?? []) {
      send(event);
    }
  },
});

function jsonResponse(value: unknown, init?: ResponseInit) {
  return Response.json(value, init);
}

function message(id: string, role: UIMessage["role"], text: string): UIMessage {
  return { id, role, parts: [{ type: "text", text }] };
}

function toolMessage(
  id: string,
  text: string,
  tool: {
    name: string;
    callId: string;
    state: "input-available" | "output-available" | "output-error";
    input?: unknown;
    output?: unknown;
    errorText?: string;
  },
): UIMessage {
  return {
    id,
    role: "assistant",
    parts: [
      { type: "text", text },
      {
        type: `tool-${tool.name}`,
        toolCallId: tool.callId,
        state: tool.state,
        input: tool.input,
        output: tool.output,
        errorText: tool.errorText,
      } as UIMessage["parts"][number],
    ],
  };
}

async function ensureDemoChat() {
  try {
    await chat.getChannel(DEMO_CHANNEL_ID);
  } catch (error) {
    if (!(error instanceof ChatNotFoundError)) throw error;
    await chat.createChannel({
      id: DEMO_CHANNEL_ID,
      metadata: { title: "Chat React Demo", kind: "component-catalog" },
    });
  }

  try {
    await chat.getThread(LIVE_THREAD_ID);
  } catch (error) {
    if (!(error instanceof ChatNotFoundError)) throw error;
    await chat.createThread({
      id: LIVE_THREAD_ID,
      root: { type: "channel", channelId: DEMO_CHANNEL_ID },
      metadata: { title: "Live tool-loop agent", kind: "live-chat" },
    });
  }

  return {
    channel: await chat.getChannel(DEMO_CHANNEL_ID),
    thread: await chat.getThread(LIVE_THREAD_ID),
  };
}

function getToolState(): Record<string, unknown> {
  const rows = db
    .query<{ key: string; value: string }, []>(
      "SELECT key, value FROM tool_loop_state ORDER BY key",
    )
    .all();
  return Object.fromEntries(rows.map((row) => [row.key, JSON.parse(row.value) as unknown]));
}

function remember(key: string, value: unknown) {
  db.prepare(
    `INSERT INTO tool_loop_state (key, value, updated_at_ms)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at_ms = excluded.updated_at_ms`,
  ).run(key, JSON.stringify(value), Date.now());
}

function parseRememberRequest(text: string): { key: string; value: string } | null {
  const match = text.match(/remember\s+([^:=\s]+)\s*(?:=|:|as)\s*(.+)$/i);
  if (!match) return null;
  const key = match[1]?.trim();
  const value = match[2]?.trim();
  if (!key || !value) return null;
  return { key, value };
}

async function runToolLoopAgent(service: ChatService, threadId: string, text: string) {
  const userPost = await service.appendPost({
    threadId,
    author: USER_AUTHOR,
    message: message(crypto.randomUUID(), "user", text),
  });

  const assistantId = crypto.randomUUID();
  const started = await service.startStreamedPost({
    threadId,
    author: AGENT_AUTHOR,
    message: message(assistantId, "assistant", "Thinking through a small tool loop..."),
  });

  const rememberRequest = parseRememberRequest(text);
  if (rememberRequest) {
    const input: JsonObject = { ...rememberRequest };
    await service.applyPostDelta({
      postId: started.post.id,
      expectedRevision: started.revision,
      message: toolMessage(assistantId, "I found a durable fact to store.", {
        name: "remember",
        callId: `${assistantId}:remember`,
        state: "input-available",
        input,
      }),
    });
    remember(rememberRequest.key, rememberRequest.value);
    const state = getToolState();
    await service.applyPostDelta({
      postId: started.post.id,
      message: toolMessage(
        assistantId,
        `Stored \`${rememberRequest.key}\`. The SQLite tool state now has ${Object.keys(state).length} key(s).`,
        {
          name: "remember",
          callId: `${assistantId}:remember`,
          state: "output-available",
          input,
          output: { saved: rememberRequest, state },
        },
      ),
    });
  } else {
    const state = getToolState();
    await service.applyPostDelta({
      postId: started.post.id,
      expectedRevision: started.revision,
      message: toolMessage(
        assistantId,
        "I checked the persisted SQLite tool state. Try `remember color = blue` to add a value.",
        {
          name: "inspectState",
          callId: `${assistantId}:inspect`,
          state: "output-available",
          input: { text },
          output: { state },
        },
      ),
    });
  }

  const completed = await service.completeStreamedPost({ postId: started.post.id });
  return { user: userPost.post, assistant: completed.post, state: getToolState() };
}

await ensureDemoChat();

const server = serve({
  routes: {
    "/api/chat/bootstrap": {
      async GET() {
        const demo = await ensureDemoChat();
        return jsonResponse({ ...demo, state: getToolState() });
      },
    },

    "/api/chat/channels/:id": {
      async GET(req) {
        return jsonResponse(await chat.getChannel(req.params.id));
      },
    },

    "/api/chat/channels/:id/threads": {
      async GET(req) {
        return jsonResponse(await chat.listThreads({ channelId: req.params.id }));
      },
    },

    "/api/chat/threads/:id/posts": {
      async GET(req) {
        return jsonResponse(await chat.listPosts({ threadId: req.params.id }));
      },
      async POST(req) {
        const body = (await req.json()) as { message: UIMessage };
        const result = await chat.appendPost({
          threadId: req.params.id,
          author: USER_AUTHOR,
          message: body.message,
        });
        return jsonResponse(result.post);
      },
    },

    "/api/chat/threads/:id/events": {
      async GET(req) {
        const threadId = req.params.id;
        const stream = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            const send = (event: ChatEvent) => {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            };
            const set = subscribers.get(threadId) ?? new Set<(event: ChatEvent) => void>();
            set.add(send);
            subscribers.set(threadId, set);
            controller.enqueue(encoder.encode(": connected\n\n"));
            req.signal.addEventListener("abort", () => {
              set.delete(send);
              if (set.size === 0) subscribers.delete(threadId);
              controller.close();
            });
          },
        });
        return new Response(stream, {
          headers: {
            "Cache-Control": "no-cache",
            "Content-Type": "text/event-stream",
          },
        });
      },
    },

    "/api/chat/agent": {
      async POST(req) {
        const body = (await req.json()) as { threadId: string; text: string };
        const text = body.text.trim();
        if (text.length === 0) {
          return jsonResponse({ error: "Message text is required" }, { status: 400 });
        }
        return jsonResponse(await runToolLoopAgent(chat, body.threadId, text));
      },
    },

    // Serve index.html for all unmatched routes.
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(`Chat demo running at ${server.url}`);
