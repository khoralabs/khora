import type { AppendPostInput, ChatEvent } from "@khoralabs/chat-core";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ChatClient } from "./client.ts";
import { mergePostIntoList } from "./client.ts";

export {
  type DisplayAttachment,
  type DisplayMessage,
  type DisplayToolCall,
  extractTextFromParts,
  extractToolCallsFromParts,
  formatPostTimestamp,
  guessAttachmentMimeType,
  toolStateForDisplay,
} from "./adapters.ts";
export type { ChatClient } from "./client.ts";
export {
  mergePostIntoList,
  postsToDisplayMessages,
  postsToUiMessages,
  postToDisplayMessage,
  postToUiMessage,
} from "./client.ts";
export { showAgentLoading, useAgentLoadingIndicator } from "./hooks/use-agent-loading.ts";
export { useChatDragDrop } from "./hooks/use-chat-drag-drop.ts";
export { type ScrollTarget, useScrollToPost } from "./hooks/use-scroll-to-post.ts";
export { scrollAnchorPostId, useThreadScrollPad } from "./hooks/use-thread-scroll-pad.ts";

type ChatContextValue = {
  client: ChatClient;
};

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider(props: { client: ChatClient; children: ReactNode }) {
  const value = useMemo(() => ({ client: props.client }), [props.client]);
  return <ChatContext.Provider value={value}>{props.children}</ChatContext.Provider>;
}

export function useChatClient(): ChatClient {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChatClient must be used within ChatProvider");
  }
  return context.client;
}

export function useChannel(channelId: string) {
  const client = useChatClient();
  const [channel, setChannel] = useState<Awaited<ReturnType<ChatClient["getChannel"]>> | null>(
    null,
  );
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    client
      .getChannel(channelId)
      .then((result) => {
        if (!cancelled) setChannel(result);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause : new Error(String(cause)));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, channelId]);

  return { channel, error, loading };
}

export function useThreads(channelId: string) {
  const client = useChatClient();
  const [threads, setThreads] = useState<Awaited<ReturnType<ChatClient["listThreads"]>>["items"]>(
    [],
  );
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const page = await client.listThreads({ channelId });
      setThreads(page.items);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error(String(cause)));
    } finally {
      setLoading(false);
    }
  }, [client, channelId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { threads, error, loading, refresh };
}

export function useThreadPosts(threadId: string) {
  const client = useChatClient();
  const [posts, setPosts] = useState<Awaited<ReturnType<ChatClient["listPosts"]>>["items"]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const page = await client.listPosts({ threadId });
      setPosts(page.items);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error(String(cause)));
    } finally {
      setLoading(false);
    }
  }, [client, threadId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const unsubscribe = client.subscribeToThread?.(threadId, (event) => {
      if (event.type === "post.stream.started" || event.type === "post.stream.delta") {
        setPosts((current) => mergePostIntoList(current, event.post));
        return;
      }
      if (event.type === "post.stream.completed") {
        setPosts((current) => mergePostIntoList(current, event.post));
        return;
      }
      if (
        event.type === "post.appended" ||
        event.type === "post.updated" ||
        event.type === "post.deleted" ||
        event.type === "post.stream.aborted"
      ) {
        void refresh();
      }
    });
    return unsubscribe;
  }, [client, threadId, refresh]);

  return { posts, error, loading, refresh };
}

export function usePostComposer(threadId: string) {
  const client = useChatClient();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const submit = useCallback(
    async (input: Omit<AppendPostInput, "threadId">) => {
      setSubmitting(true);
      setError(null);
      try {
        return await client.appendPost({ ...input, threadId });
      } catch (cause) {
        const nextError = cause instanceof Error ? cause : new Error(String(cause));
        setError(nextError);
        throw nextError;
      } finally {
        setSubmitting(false);
      }
    },
    [client, threadId],
  );

  return { submit, submitting, error };
}

export type ThreadContextValue = {
  threadId: string;
  posts: ReturnType<typeof useThreadPosts>["posts"];
  refresh: () => Promise<void>;
};

const ThreadContext = createContext<ThreadContextValue | null>(null);
const ChannelContext = createContext<{ channelId: string } | null>(null);

export function ChannelRoot(props: { channelId: string; children: ReactNode }) {
  const value = useMemo(() => ({ channelId: props.channelId }), [props.channelId]);
  return <ChannelContext.Provider value={value}>{props.children}</ChannelContext.Provider>;
}

export function useChannelContext() {
  const context = useContext(ChannelContext);
  if (!context) {
    throw new Error("useChannelContext must be used within ChannelRoot");
  }
  return context;
}

export function ThreadRoot(props: { threadId: string; children: ReactNode }) {
  const { posts, refresh } = useThreadPosts(props.threadId);
  const value = useMemo(
    () => ({ threadId: props.threadId, posts, refresh }),
    [props.threadId, posts, refresh],
  );
  return <ThreadContext.Provider value={value}>{props.children}</ThreadContext.Provider>;
}

export function useThreadContext() {
  const context = useContext(ThreadContext);
  if (!context) {
    throw new Error("useThreadContext must be used within ThreadRoot");
  }
  return context;
}

export function ThreadList(props: {
  children: (threads: ReturnType<typeof useThreads>["threads"]) => ReactNode;
}) {
  const { channelId } = useChannelContext();
  const { threads } = useThreads(channelId);
  return <>{props.children(threads)}</>;
}

export function PostList(props: { children: (posts: ThreadContextValue["posts"]) => ReactNode }) {
  const { posts } = useThreadContext();
  return <>{props.children(posts)}</>;
}

export function PostItem(props: {
  postId: string;
  children: (post: ThreadContextValue["posts"][number]) => ReactNode;
}) {
  const { posts } = useThreadContext();
  const post = posts.find((item) => item.id === props.postId);
  if (!post) return null;
  return <>{props.children(post)}</>;
}

export function PostAuthor(props: {
  postId: string;
  children: (author: ThreadContextValue["posts"][number]["author"]) => ReactNode;
}) {
  const { posts } = useThreadContext();
  const post = posts.find((item) => item.id === props.postId);
  if (!post) return null;
  return <>{props.children(post.author)}</>;
}

export function PostParts(props: {
  postId: string;
  children: (parts: ThreadContextValue["posts"][number]["parts"]) => ReactNode;
}) {
  const { posts } = useThreadContext();
  const post = posts.find((item) => item.id === props.postId);
  if (!post) return null;
  return <>{props.children(post.parts)}</>;
}

export function Composer(props: { children: ReactNode }) {
  return <>{props.children}</>;
}

export function ComposerInput(props: {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
}) {
  return (
    <textarea
      aria-label="composer-input"
      value={props.value}
      placeholder={props.placeholder}
      onChange={(event) => props.onChange(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          props.onSubmit?.();
        }
      }}
    />
  );
}

export function ComposerSubmit(props: {
  onClick: () => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label="composer-submit"
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children ?? "Send"}
    </button>
  );
}

export function ComposerAttachments(props: { children: ReactNode }) {
  return <section aria-label="composer-attachments">{props.children}</section>;
}

export function PostActions(props: { children: ReactNode }) {
  return <section aria-label="post-actions">{props.children}</section>;
}

export type { ChatEvent };
