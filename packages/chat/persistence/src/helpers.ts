import type {
  AppendPostInput,
  EditPostInput,
  PreparedAppendPost,
  PreparedEditPost,
} from "@khoralabs/chat-core";
import {
  computeAclEventContentHash,
  computeContentHash,
  computeLineageHash,
  createId,
} from "@khoralabs/chat-core";
import type { UIMessage } from "ai";

export type PrepareAppendOptions = {
  generateId?: () => string;
  now?: () => number;
};

export function prepareAppendPost(
  input: AppendPostInput & {
    previousPostVersionId: string | null;
    previousLineageHash: string | null;
  },
  options: PrepareAppendOptions = {},
): PreparedAppendPost {
  const generate = options.generateId ?? createId;
  const now = options.now ?? (() => Date.now());
  const postId = input.message.id || generate();
  const versionId = generate();
  const createdAtMs = now();
  const message: UIMessage = { ...input.message, id: postId };

  const contentHash = computeContentHash({
    postId,
    versionId,
    threadId: input.threadId,
    author: input.author,
    role: message.role,
    parts: message.parts,
    metadata: message.metadata,
    mentions: input.mentions,
    model: input.model,
    usage: input.usage,
    parentVersionId: null,
    previousPostVersionId: input.previousPostVersionId,
  });

  const lineageHash = computeLineageHash({
    previousLineageHash: input.previousLineageHash,
    contentHash,
    postId,
    versionId,
  });

  return {
    postId,
    versionId,
    threadId: input.threadId,
    author: input.author,
    message,
    mentions: input.mentions,
    model: input.model,
    usage: input.usage,
    previousPostVersionId: input.previousPostVersionId,
    previousLineageHash: input.previousLineageHash,
    parentVersionId: null,
    createdAtMs,
    contentHash,
    lineageHash,
  };
}

export function prepareEditPost(
  input: EditPostInput & {
    threadId: string;
    previousPostVersionId: string | null;
    previousLineageHash: string | null;
  },
  options: PrepareAppendOptions = {},
): PreparedEditPost {
  const generate = options.generateId ?? createId;
  const now = options.now ?? (() => Date.now());
  const postId = input.postId;
  const versionId = generate();
  const createdAtMs = now();
  const message: UIMessage = { ...input.message, id: postId };

  const contentHash = computeContentHash({
    postId,
    versionId,
    threadId: input.threadId,
    author: input.author,
    role: message.role,
    parts: message.parts,
    metadata: message.metadata,
    mentions: input.mentions,
    model: input.model,
    usage: input.usage,
    parentVersionId: input.parentVersionId,
    previousPostVersionId: input.previousPostVersionId,
  });

  const lineageHash = computeLineageHash({
    previousLineageHash: input.previousLineageHash,
    contentHash,
    postId,
    versionId,
  });

  return {
    postId,
    versionId,
    threadId: input.threadId,
    author: input.author,
    message,
    mentions: input.mentions,
    model: input.model,
    usage: input.usage,
    previousPostVersionId: input.previousPostVersionId,
    previousLineageHash: input.previousLineageHash,
    parentVersionId: input.parentVersionId,
    createdAtMs,
    contentHash,
    lineageHash,
  };
}

export function buildAclEventContentHash(input: {
  type: string;
  targetType: "channel" | "thread";
  targetId: string;
  scope?: { type: string; id: string };
  role?: string;
  actor: { type: string; id: string };
  previousAclEventId?: string | null;
}): string {
  return computeAclEventContentHash(input);
}
