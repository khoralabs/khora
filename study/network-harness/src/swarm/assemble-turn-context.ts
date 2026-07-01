import type { Database } from "bun:sqlite";
import type { UIMessage } from "ai";
import type { AgentUIMessage, AgentWorkflowParams } from "../agent/types.ts";
import type { AgentChatClient } from "../chat.ts";
import { readPreviousPostVersion } from "../chat-signing.ts";
import type { InboxEntry } from "./swarm-state.ts";
import type { AgentLoopState, SwarmConfig, ThreadHashSnapshot } from "./types.ts";

function postToUiMessage(post: {
  id: string;
  role: string;
  parts: UIMessage["parts"];
}): AgentUIMessage {
  return {
    id: post.id,
    role: post.role,
    parts: post.parts as AgentUIMessage["parts"],
  };
}

function formatInboxBlock(entries: InboxEntry[]): string {
  if (entries.length === 0) return "<inbox_entries></inbox_entries>";
  const lines = entries.map(
    (entry) => `<entry id="${entry.id}">${JSON.stringify(entry.event)}</entry>`,
  );
  return `<inbox_entries>\n${lines.join("\n")}\n</inbox_entries>`;
}

function formatThreadBlock(threadId: string, messages: AgentUIMessage[]): string {
  const lines = messages.map(
    (message) =>
      `<message role="${message.role}">${message.parts
        .filter((part) => part.type === "text")
        .map((part) => ("text" in part ? String(part.text) : ""))
        .join("")}</message>`,
  );
  return `<thread id="${threadId}">\n${lines.join("\n")}\n</thread>`;
}

export async function collectThreadHashSnapshots(
  chatDb: Database,
  agentChat: AgentChatClient,
): Promise<ThreadHashSnapshot[]> {
  const threads = await agentChat.listThreads();
  const snapshots: ThreadHashSnapshot[] = [];
  for (const thread of threads.items) {
    const head = readPreviousPostVersion(chatDb, thread.id);
    const posts = await agentChat.listPosts(thread.id, { limit: 1 });
    const lastPost = posts.items.at(-1);
    snapshots.push({
      threadId: thread.id,
      headLineageHash: head?.lineageHash ?? "",
      lastPostContentHash: lastPost && "contentHash" in lastPost ? lastPost.contentHash : undefined,
    });
  }
  return snapshots;
}

export async function assembleTurnContext(input: {
  config: SwarmConfig;
  agent: AgentLoopState;
  agentChat: AgentChatClient;
  inboxEntries: InboxEntry[];
}): Promise<{
  params: AgentWorkflowParams;
  inboxEntryIds: string[];
}> {
  const { config, agent, agentChat, inboxEntries } = input;
  const inboxEntryIds = inboxEntries.map((entry) => entry.id);

  const selfPosts = await agentChat.listPosts(agent.selfThreadId, {
    limit: config.contextMessageLimit,
  });
  const selfMessages = selfPosts.items.map(postToUiMessage);

  const threadBlocks: string[] = [];
  const threads = await agentChat.listThreads();
  for (const thread of threads.items) {
    const posts = await agentChat.listPosts(thread.id, { limit: config.contextMessageLimit });
    threadBlocks.push(formatThreadBlock(thread.id, posts.items.map(postToUiMessage)));
  }

  const runId = crypto.randomUUID();
  const params: AgentWorkflowParams = {
    runId,
    agent: {
      id: agent.agentId,
      name: `Agent ${agent.role}`,
      actingFor: { type: "agent", id: agent.did },
    },
    model: config.model,
    context: {
      sessionId: config.sessionId,
      threadId: agent.selfThreadId,
      messages: selfMessages,
      instructions: [formatInboxBlock(inboxEntries), ...threadBlocks],
    },
    output: {
      chat: {
        threadId: agent.selfThreadId,
        streamDeltas: false,
      },
    },
  };

  return { params, inboxEntryIds };
}
