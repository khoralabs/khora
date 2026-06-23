import {
  ChannelRoot,
  ChatProvider,
  type DisplayMessage,
  PostAuthor,
  PostItem,
  PostList,
  PostParts,
  postsToDisplayMessages,
  ThreadRoot,
  useAgentLoadingIndicator,
  useChannel,
  useChatDragDrop,
  usePostComposer,
  useScrollToPost,
  useThreadPosts,
  useThreads,
} from "@khoralabs/chat-react";
import {
  Attachment,
  type AttachmentData,
  AttachmentInfo,
  AttachmentPreview,
  Attachments,
  ChatAuthorAvatar,
  ChatDropOverlay,
  ChatThreadView,
  CodeBlock,
  Message,
  MessageContent,
  MessageHeader,
  MessageResponse,
  MessageTimestamp,
  PostMessage,
  PostMessageAttachments,
  PostMessageContent,
  PostMessageHeader,
  PostMessages,
  PostMessagesEmpty,
  PostMessagesLoading,
  PostMessagesScrollPad,
  PostMessageTimestamp,
  PromptComposer,
  type PromptInputMessage,
  Shimmer,
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@khoralabs/chat-react/ui";
import type { ChatStatus } from "ai";
import { useEffect, useMemo, useState } from "react";
import "./index.css";
import { chatClient, type DemoBootstrap, loadDemoBootstrap, runAgent } from "./chat-client";

const userAuthor = { name: "Demo User" };
const agentAuthor = { name: "Tool Loop Agent" };

const mockAttachment: AttachmentData = {
  id: "mock-file",
  type: "file",
  filename: "component-catalog.md",
  mediaType: "text/markdown",
  url: "#",
};

const mockMessages: DisplayMessage[] = [
  {
    id: "catalog-user",
    role: "user",
    content: "Show the chat primitives with a file attachment.",
    createdAtMs: Date.now() - 90_000,
    author: userAuthor,
    attachments: [
      {
        id: "mock-file",
        fileName: "component-catalog.md",
        mediaType: "text/markdown",
        url: "#",
      },
    ],
  },
  {
    id: "catalog-agent",
    role: "assistant",
    content: "Here is a static message with markdown, a tool call, attribution, and timestamp.",
    createdAtMs: Date.now() - 60_000,
    author: agentAuthor,
    toolCalls: [
      {
        id: "catalog-tool",
        toolName: "inspectCatalog",
        state: "completed",
        input: { components: ["PostMessages", "PromptComposer", "ChatThreadView"] },
        output: { represented: true },
      },
    ],
  },
];

function resolveAuthor(author: { type: string; id: string }) {
  if (author.type === "agent") return agentAuthor;
  return userAuthor;
}

export function App() {
  const [bootstrap, setBootstrap] = useState<DemoBootstrap | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDemoBootstrap()
      .then(setBootstrap)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      });
  }, []);

  if (error) {
    return <main className="p-8 text-destructive">Could not load demo: {error}</main>;
  }

  if (!bootstrap) {
    return <main className="p-8 text-muted-foreground">Loading chat demo…</main>;
  }

  return (
    <ChatProvider client={chatClient}>
      <ChannelRoot channelId={bootstrap.channel.id}>
        <ThreadRoot threadId={bootstrap.thread.id}>
          <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 p-6">
            <header className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Chat framework demo</p>
              <h1 className="text-4xl font-semibold tracking-tight">
                `@khoralabs/chat-react` catalog and live agent
              </h1>
              <p className="max-w-3xl text-muted-foreground">
                Static examples cover the component surface. The live panel uses the hooks, SSE
                events, and a SQLite-backed tool-loop agent. Try:
                <code className="mx-2 rounded bg-muted px-2 py-1">remember color = blue</code>
              </p>
            </header>

            <HookStatus channelId={bootstrap.channel.id} threadId={bootstrap.thread.id} />

            <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
              <LiveChat threadId={bootstrap.thread.id} />
              <ComponentCatalog />
            </section>
          </main>
        </ThreadRoot>
      </ChannelRoot>
    </ChatProvider>
  );
}

function HookStatus({ channelId, threadId }: { channelId: string; threadId: string }) {
  const channel = useChannel(channelId);
  const threads = useThreads(channelId);
  const posts = useThreadPosts(threadId);
  const composer = usePostComposer(threadId);
  const firstPostId = posts.posts[0]?.id;

  return (
    <section className="grid gap-3 rounded-xl border bg-card p-4 text-sm md:grid-cols-4">
      <Status
        label="useChannel"
        value={channel.channel?.id ?? (channel.loading ? "loading" : "n/a")}
      />
      <Status label="useThreads" value={`${threads.threads.length} thread(s)`} />
      <Status label="useThreadPosts" value={`${posts.posts.length} post(s)`} />
      <button
        className="rounded-md border px-3 py-2 text-left hover:bg-accent"
        type="button"
        onClick={() => {
          void composer.submit({
            author: { type: "account", id: "demo-user" },
            message: {
              id: crypto.randomUUID(),
              role: "user",
              parts: [{ type: "text", text: "Direct append from usePostComposer." }],
            },
          });
        }}
      >
        usePostComposer: append note
      </button>
      <PostList>
        {() =>
          firstPostId ? (
            <PostItem postId={firstPostId}>
              {(post) => (
                <div className="md:col-span-4 rounded-md bg-muted p-3">
                  <PostAuthor postId={post.id}>
                    {(author) => (
                      <span>
                        PostAuthor: {author.type}/{author.id}
                      </span>
                    )}
                  </PostAuthor>
                  <PostParts postId={post.id}>
                    {(parts) => <span className="ml-3">PostParts: {parts.length} part(s)</span>}
                  </PostParts>
                </div>
              )}
            </PostItem>
          ) : (
            <div className="md:col-span-4 rounded-md bg-muted p-3">
              PostList is ready; send a live message to populate it.
            </div>
          )
        }
      </PostList>
    </section>
  );
}

function Status({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function LiveChat({ threadId }: { threadId: string }) {
  const { posts, refresh } = useThreadPosts(threadId);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<ChatStatus>("ready");
  const [chatError, setChatError] = useState<string | null>(null);
  const [scrollTarget, setScrollTarget] = useState<{ postId: string } | null>(null);
  const dragDrop = useChatDragDrop(true);
  const messages = useMemo(() => postsToDisplayMessages(posts, { resolveAuthor }), [posts]);
  const loading = useAgentLoadingIndicator({ status, messages });
  useScrollToPost(scrollTarget, () => setScrollTarget(null), true);

  const submit = async (message: PromptInputMessage) => {
    const text = message.text.trim();
    if (!text) return;
    setChatError(null);
    setStatus("submitted");
    setInput("");
    try {
      await runAgent({ threadId, text });
      await refresh();
    } catch (cause) {
      setChatError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setStatus("ready");
    }
  };

  return (
    <section className="min-h-[720px] overflow-hidden rounded-xl border bg-card">
      <div className="border-b p-4">
        <h2 className="text-xl font-semibold">Live SQLite tool-loop chat</h2>
        <p className="text-sm text-muted-foreground">
          Messages persist in <code>packages/example/sqlite</code>. The agent streams a tool call
          and stores facts in a separate SQLite table.
        </p>
      </div>
      <ChatThreadView
        agentAuthor={agentAuthor}
        awaitingOpening={messages.length === 0}
        canWrite
        chatError={chatError}
        chatRootRef={dragDrop.chatRootRef}
        connected
        input={input}
        isDragActive={dragDrop.isDragActive}
        messages={messages}
        onAttachmentControlsReady={dragDrop.handleAttachmentControlsReady}
        onError={setChatError}
        onStop={() => setStatus("ready")}
        onSubmit={submit}
        onTextChange={(event) => setInput(event.currentTarget.value)}
        placeholder="Ask something, or type: remember project = khora"
        showAgentLoading={loading}
        status={status}
      />
      <div className="border-t p-3">
        <button
          className="rounded-md border px-3 py-2 text-sm hover:bg-accent"
          type="button"
          onClick={() => {
            const last = messages.at(-1);
            if (last) setScrollTarget({ postId: last.id });
          }}
        >
          useScrollToPost: jump to latest
        </button>
      </div>
    </section>
  );
}

function ComponentCatalog() {
  return (
    <aside className="space-y-6">
      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-xl font-semibold">Static component catalog</h2>
        <div className="h-[360px] overflow-hidden rounded-lg border">
          <PostMessages loadingAuthor={agentAuthor} messages={mockMessages} status="submitted">
            <PostMessagesEmpty />
            {mockMessages.map((message) => (
              <PostMessage key={message.id} message={message}>
                <PostMessageHeader />
                <PostMessageAttachments>
                  <Attachments className="mb-2" variant="grid">
                    <Attachment data={mockAttachment}>
                      <AttachmentPreview />
                    </Attachment>
                  </Attachments>
                </PostMessageAttachments>
                <PostMessageContent />
                <PostMessageTimestamp />
              </PostMessage>
            ))}
            <PostMessagesLoading />
            <PostMessagesScrollPad />
          </PostMessages>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4">
        <h3 className="mb-3 font-semibold">PromptComposer</h3>
        <PromptComposer
          chatError={null}
          connected
          input=""
          onAttachmentControlsReady={() => undefined}
          onError={() => undefined}
          onStop={() => undefined}
          onSubmit={() => undefined}
          onTextChange={() => undefined}
          placeholder="Static composer shell"
          status="ready"
        />
      </section>

      <section className="rounded-xl border bg-card p-4">
        <h3 className="mb-3 font-semibold">Primitives</h3>
        <div className="space-y-4">
          <Message from="assistant">
            <MessageHeader author={agentAuthor} from="assistant" />
            <MessageContent>
              <MessageResponse>Markdown **response** via `MessageResponse`.</MessageResponse>
            </MessageContent>
            <MessageTimestamp from="assistant" label="Just now" />
          </Message>

          <Attachments variant="list">
            <Attachment data={mockAttachment}>
              <AttachmentPreview />
              <AttachmentInfo showMediaType />
            </Attachment>
          </Attachments>

          <Tool defaultOpen>
            <ToolHeader
              state="output-available"
              title="inspectCatalog"
              type="tool-inspectCatalog"
            />
            <ToolContent>
              <ToolInput input={{ static: true }} />
              <ToolOutput errorText={undefined} output={{ ok: true }} />
            </ToolContent>
          </Tool>

          <CodeBlock code={`const demo = "chat-react";`} language="ts" />
          <p className="text-sm text-muted-foreground">
            <Shimmer as="span">Shimmer loading text</Shimmer>
          </p>
          <div className="relative h-28 rounded-lg border">
            <ChatDropOverlay active />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <ChatAuthorAvatar author={agentAuthor} />
            ChatAuthorAvatar
          </div>
        </div>
      </section>
    </aside>
  );
}

export default App;
