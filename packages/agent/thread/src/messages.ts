import type { UIMessage } from "ai";

/**
 * Who sent the line and when. The speaker is always {@link authorId} — not
 * {@link UIMessage.role} (`user` / `assistant` are AI SDK transport semantics, not identity).
 */
export type ThreadMessageMetadata = {
  authorId: string;
  ts: number;
};

/**
 * One message in a multi-participant thread, using AI SDK v6 `UIMessage` `parts` (text, tools, etc.).
 */
export type ThreadMessage = UIMessage<ThreadMessageMetadata> & {
  metadata: ThreadMessageMetadata;
};

/**
 * Host input before a {@link ThreadContext} fills `id` and `metadata.ts`.
 */
export type PostThreadMessageInput = {
  authorId: string;
  role: ThreadMessage["role"];
  parts: ThreadMessage["parts"];
};

/** User-originated plain text (e.g. a bootstrap line before the first model turn). */
export function postThreadUserText(authorId: string, text: string): PostThreadMessageInput {
  return {
    authorId,
    role: "user",
    parts: [{ type: "text", text, state: "done" }],
  };
}
