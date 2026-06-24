import {
  ChatProvider,
  postsToDisplayMessages,
  usePostComposer,
  useThreadPosts,
} from "@khoralabs/chat-react";
import { ChatThreadView } from "@khoralabs/chat-react/ui";
import type { ChatStatus } from "ai";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { exedraChatClient, loadExedraChatBootstrap } from "@/lib/exedra-chat-client";

import type { ThreadKind } from "./thread-chat-types";

function FrameworkThread({
  canWrite,
  composerHeader,
  placeholder,
  readOnlyMessage,
  threadId,
}: {
  canWrite: boolean;
  composerHeader?: ReactNode;
  placeholder: string;
  readOnlyMessage: string;
  threadId: string;
}) {
  const { posts, error, loading } = useThreadPosts(threadId);
  const composer = usePostComposer(threadId);
  const [input, setInput] = useState("");
  const status: ChatStatus = composer.submitting ? "submitted" : "ready";
  const messages = useMemo(
    () =>
      postsToDisplayMessages(posts, {
        resolveAuthor: (author) => ({
          name: author.type === "agent" ? "Exedra" : "You",
        }),
      }),
    [posts],
  );

  if (loading && posts.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  return (
    <ChatThreadView
      agentAuthor={{ name: "Exedra" }}
      canWrite={canWrite}
      chatError={error?.message ?? composer.error?.message ?? null}
      composerHeader={composerHeader}
      connected
      input={input}
      onAttachmentControlsReady={() => {}}
      onError={() => {}}
      onStop={() => {}}
      onSubmit={(message) => {
        const text = message.text.trim();
        if (text.length === 0) return;
        setInput("");
        void composer.submit({
          author: { type: "account", id: "current-user" },
          message: {
            id: crypto.randomUUID(),
            role: "user",
            parts: [{ type: "text", text }],
          },
        });
      }}
      onTextChange={(event) => setInput(event.currentTarget.value)}
      placeholder={placeholder}
      readOnlyMessage={readOnlyMessage}
      status={status}
      messages={messages}
    />
  );
}

export function ChatFrameworkThreadPanel({
  canWrite,
  composerHeader,
  kind,
  onConnectedChange,
  onError,
  sessionId,
}: {
  canWrite: boolean;
  composerHeader?: ReactNode;
  kind: ThreadKind;
  onConnectedChange?: (connected: boolean) => void;
  onError: (error: string | null) => void;
  sessionId: string;
}) {
  const [threadId, setThreadId] = useState<string | null>(null);

  useEffect(() => {
    onConnectedChange?.(true);
  }, [onConnectedChange]);

  useEffect(() => {
    let cancelled = false;
    loadExedraChatBootstrap(sessionId)
      .then((bootstrap) => {
        if (cancelled) return;
        setThreadId(
          kind === "facilitation" ? bootstrap.facilitationThreadId : bootstrap.interviewThreadId,
        );
        onError(null);
      })
      .catch((error: unknown) => {
        if (!cancelled) onError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [kind, onError, sessionId]);

  if (threadId === null) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  return (
    <ChatProvider client={exedraChatClient}>
      <FrameworkThread
        canWrite={canWrite}
        composerHeader={composerHeader}
        placeholder={
          kind === "facilitation" ? "Discuss with facilitators…" : "Share your thoughts…"
        }
        readOnlyMessage={
          kind === "facilitation" ? "Read-only facilitation access" : "Read-only interview access"
        }
        threadId={threadId}
      />
    </ChatProvider>
  );
}
