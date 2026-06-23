import type { Thread } from "@khoralabs/chat-core";
import type {
  AppendPostInput,
  Channel,
  ChatClient,
  ChatEvent,
  ListPostsInput,
  ListThreadsInput,
  Post,
  PostPage,
  ThreadPage,
} from "@khoralabs/chat-react/client";

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export type DemoBootstrap = {
  channel: Channel;
  thread: Thread;
  state: Record<string, unknown>;
};

export const chatClient: ChatClient = {
  getChannel(id) {
    return requestJson<Channel>(`/api/chat/channels/${encodeURIComponent(id)}`);
  },
  listThreads(input: ListThreadsInput) {
    if (!input.channelId) return Promise.resolve({ items: [] });
    return requestJson<ThreadPage>(
      `/api/chat/channels/${encodeURIComponent(input.channelId)}/threads`,
    );
  },
  listPosts(input: ListPostsInput) {
    return requestJson<PostPage>(`/api/chat/threads/${encodeURIComponent(input.threadId)}/posts`);
  },
  appendPost(input: AppendPostInput) {
    return requestJson<Post>(`/api/chat/threads/${encodeURIComponent(input.threadId)}/posts`, {
      method: "POST",
      body: JSON.stringify({ message: input.message }),
    });
  },
  subscribeToThread(threadId, handler) {
    const source = new EventSource(`/api/chat/threads/${encodeURIComponent(threadId)}/events`);
    source.onmessage = (event) => handler(JSON.parse(event.data) as ChatEvent);
    return () => source.close();
  },
};

export function loadDemoBootstrap(): Promise<DemoBootstrap> {
  return requestJson<DemoBootstrap>("/api/chat/bootstrap");
}

export function runAgent(input: { threadId: string; text: string }) {
  return requestJson<{ state: Record<string, unknown> }>("/api/chat/agent", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
