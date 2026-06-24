import type { Post, ScopeRef } from "@khoralabs/chat-core";
import type { UIMessage } from "ai";
import type { ChatAuthor } from "./ui/author-avatar.tsx";

export type DisplayAttachment = {
  id: string;
  fileName: string;
  mediaType?: string;
  byteSize?: number;
  url?: string;
};

export type DisplayToolCall = {
  id: string;
  toolName: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  state: "running" | "completed" | "error";
};

export type DisplayMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAtMs: number;
  author: ChatAuthor | null;
  status?: Post["status"];
  attachments?: DisplayAttachment[];
  toolCalls?: DisplayToolCall[];
};

export type PostToDisplayOptions = {
  resolveAuthor?: (author: ScopeRef) => ChatAuthor | null;
  resolveAttachmentUrl?: (attachment: DisplayAttachment) => string | undefined;
};

export function formatPostTimestamp(ms: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ms));
}

export function extractTextFromParts(parts: UIMessage["parts"]): string {
  return parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export function extractToolCallsFromParts(parts: UIMessage["parts"]): DisplayToolCall[] {
  const toolCalls: DisplayToolCall[] = [];
  for (const part of parts) {
    if (typeof part.type !== "string" || !part.type.startsWith("tool-")) continue;
    const toolPart = part as {
      toolCallId?: string;
      state?: string;
      input?: unknown;
      output?: unknown;
      errorText?: string;
    };
    const toolName = part.type.slice("tool-".length);
    toolCalls.push({
      id: toolPart.toolCallId ?? `${toolName}-${toolCalls.length}`,
      toolName,
      input: toolPart.input,
      output: toolPart.output,
      errorText: toolPart.errorText,
      state:
        toolPart.state === "output-available"
          ? "completed"
          : toolPart.state === "output-error"
            ? "error"
            : "running",
    });
  }
  return toolCalls;
}

type MessageDocumentWire = {
  id: string;
  fileName: string;
  mimeType?: string;
  mediaType?: string;
  byteSize?: number;
};

export function mapDocumentMetadata(document: MessageDocumentWire): DisplayAttachment {
  return {
    id: document.id,
    fileName: document.fileName,
    mediaType: document.mimeType ?? document.mediaType,
    byteSize: document.byteSize,
  };
}

export function guessAttachmentMimeType(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "pdf":
      return "application/pdf";
    case "txt":
      return "text/plain";
    case "md":
      return "text/markdown";
    case "json":
      return "application/json";
    case "mp4":
      return "video/mp4";
    case "mp3":
      return "audio/mpeg";
    default:
      return "application/octet-stream";
  }
}

function defaultAuthor(author: ScopeRef): ChatAuthor {
  return { name: author.id };
}

export function postToDisplayMessage(
  post: Post,
  options: PostToDisplayOptions = {},
): DisplayMessage | null {
  if (post.role !== "user" && post.role !== "assistant") return null;

  const metadata = post.metadata as
    | {
        kickoff?: boolean;
        displayText?: string;
        documents?: MessageDocumentWire[];
      }
    | undefined;
  if (metadata?.kickoff === true) return null;

  const content =
    typeof metadata?.displayText === "string"
      ? metadata.displayText
      : extractTextFromParts(post.parts);
  const attachments = metadata?.documents?.map((document) => {
    const attachment = mapDocumentMetadata(document);
    return {
      ...attachment,
      url: options.resolveAttachmentUrl?.(attachment),
    };
  });
  const toolCalls = extractToolCallsFromParts(post.parts);

  if (
    post.status !== "streaming" &&
    content.length === 0 &&
    (attachments?.length ?? 0) === 0 &&
    toolCalls.length === 0
  ) {
    return null;
  }

  return {
    id: post.id,
    role: post.role,
    content,
    createdAtMs: post.createdAtMs,
    author: options.resolveAuthor?.(post.author) ?? defaultAuthor(post.author),
    status: post.status,
    attachments,
    toolCalls,
  };
}

export function postsToDisplayMessages(
  posts: Post[],
  options: PostToDisplayOptions = {},
): DisplayMessage[] {
  return posts
    .map((post) => postToDisplayMessage(post, options))
    .filter((message): message is DisplayMessage => message !== null);
}

export function toolStateForDisplay(state: string | undefined): DisplayToolCall["state"] {
  if (state === "output-available") return "completed";
  if (state === "output-error") return "error";
  return "running";
}
