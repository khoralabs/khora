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
    try {
      const body = JSON.parse(text) as { error?: unknown };
      if (typeof body.error === "string" && body.error.length > 0) throw new Error(body.error);
    } catch (error) {
      if (error instanceof Error && error.name === "Error") throw error;
    }
    if (text.trimStart().startsWith("<!doctype html>")) {
      throw new Error(`Request failed: ${response.status}`);
    }
    throw new Error(text || `Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export type ExedraChatBootstrap = {
  interviewThreadId: string;
  facilitationThreadId: string;
};

export function loadExedraChatBootstrap(sessionId: string): Promise<ExedraChatBootstrap> {
  return requestJson<ExedraChatBootstrap>(
    `/api/sessions/${encodeURIComponent(sessionId)}/chat/bootstrap`,
  );
}

export const exedraChatClient: ChatClient = {
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
