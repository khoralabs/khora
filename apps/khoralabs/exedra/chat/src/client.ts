import type {
  AppendPostInput,
  ChatEvent,
  ChatService,
  CreateChannelInput,
  CreateThreadInput,
  ListPostsInput,
  ListThreadsInput,
  StartStreamedPostInput,
} from "@khoralabs/chat-core";
import { ChatNotFoundError } from "@khoralabs/chat-core";
import type { UIMessage } from "ai";

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    let message = `Chat request failed ${res.status}`;
    try {
      const data = JSON.parse(text) as { error?: string };
      if (data.error !== undefined && data.error.length > 0) message = data.error;
    } catch {
      if (text.length > 0) message = text;
    }
    if (res.status === 404) {
      const match = /^(channel|thread|post) not found: (.+)$/i.exec(message);
      if (match?.[1] !== undefined && match[2] !== undefined) {
        throw new ChatNotFoundError(match[1].toLowerCase(), match[2]);
      }
    }
    throw new Error(message);
  }
  return (text.length > 0 ? JSON.parse(text) : {}) as T;
}

export type ChatFetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type ChatServiceClientOptions = {
  baseUrl: string;
  token: string;
  fetchFn?: ChatFetchFn;
  subscribeToThread?: (threadId: string, handler: (event: ChatEvent) => void) => () => void;
};

export type ChatServiceClient = Pick<
  ChatService,
  | "getChannel"
  | "createChannel"
  | "getThread"
  | "createThread"
  | "listPosts"
  | "listThreads"
  | "appendPost"
  | "startStreamedPost"
  | "applyPostDelta"
  | "completeStreamedPost"
  | "abortStreamedPost"
> & {
  subscribeToThread(threadId: string, handler: (event: ChatEvent) => void): () => void;
};

export function createChatClient(options: ChatServiceClientOptions): ChatServiceClient {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const fetchFn = options.fetchFn ?? fetch;

  async function post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetchFn(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return readJson<T>(res);
  }

  return {
    getChannel(id) {
      return post("/channels/get", { channelId: id });
    },
    createChannel(input: CreateChannelInput) {
      return post("/channels/create", input);
    },
    getThread(id) {
      return post("/threads/get", { threadId: id });
    },
    createThread(input: CreateThreadInput) {
      return post("/threads/create", input);
    },
    listThreads(input: ListThreadsInput) {
      return post("/threads/list", input);
    },
    listPosts(input: ListPostsInput) {
      return post("/threads/list-posts", input);
    },
    async appendPost(input: AppendPostInput) {
      return post("/threads/append-post", input);
    },
    startStreamedPost(input: StartStreamedPostInput) {
      return post("/internal/chat/streamed-posts", input);
    },
    applyPostDelta(input) {
      return post(`/internal/chat/posts/${encodeURIComponent(input.postId)}/deltas`, input);
    },
    completeStreamedPost(input) {
      return post(`/internal/chat/posts/${encodeURIComponent(input.postId)}/complete`, input);
    },
    abortStreamedPost(input) {
      return post(`/internal/chat/posts/${encodeURIComponent(input.postId)}/abort`, input);
    },
    subscribeToThread(threadId, handler) {
      if (options.subscribeToThread !== undefined) {
        return options.subscribeToThread(threadId, handler);
      }
      const wsUrl = `${baseUrl.replace(/^http/, "ws")}/ws/threads/${encodeURIComponent(threadId)}?token=${encodeURIComponent(options.token)}`;
      const ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => handler(JSON.parse(String(event.data)) as ChatEvent);
      return () => ws.close();
    },
  };
}

export type StartStreamedPostBody = {
  author: StartStreamedPostInput["author"];
  message: UIMessage;
  threadId: string;
  idempotencyKey?: string;
};
