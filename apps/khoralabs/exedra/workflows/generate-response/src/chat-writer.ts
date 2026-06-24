import type { ChatService, PostModelMetadata, PostUsage } from "@khoralabs/chat-core";
import type { UIMessage } from "ai";

import type { ExedraInternalClient } from "./exedra-internal-client.ts";
import { type GenerateResponsePolicyState, requireChatWriteAccess } from "./policies/index.ts";
import type { GenerateResponseWorkflowParams } from "./types.ts";

export type GenerateResponseChatWriter = {
  postId: string;
  revision: number;
  start(message: UIMessage): Promise<void>;
  apply(
    message: UIMessage,
    metadata?: { model?: PostModelMetadata; usage?: PostUsage },
  ): Promise<void>;
  complete(): Promise<UIMessage>;
  abort(): Promise<void>;
};

export function createGenerateResponseChatWriter(
  service: ChatService,
  params: GenerateResponseWorkflowParams,
  policyState: GenerateResponsePolicyState,
): GenerateResponseChatWriter {
  const threadId = params.output.chat.threadId;
  requireChatWriteAccess(policyState, threadId);

  let postId = params.output.chat.postId ?? params.responseId;
  let revision = 0;

  return {
    get postId() {
      return postId;
    },
    get revision() {
      return revision;
    },
    async start(message) {
      const result = await service.startStreamedPost({
        threadId,
        author: params.agent.actingFor,
        message: { ...message, id: postId },
        idempotencyKey: `${params.responseId}:start`,
      });
      postId = result.post.id;
      revision = result.revision;
    },
    async apply(message, metadata) {
      const result = await service.applyPostDelta({
        postId,
        message: { ...message, id: postId },
        model: metadata?.model,
        usage: metadata?.usage,
        expectedRevision: revision,
      });
      revision = result.revision;
    },
    async complete() {
      const { post } = await service.completeStreamedPost({
        postId,
        expectedRevision: revision,
        idempotencyKey: `${params.responseId}:complete`,
      });
      return post;
    },
    async abort() {
      await service.abortStreamedPost({ postId });
    },
  };
}

export function createGenerateResponseHttpChatWriter(
  client: ExedraInternalClient,
  params: GenerateResponseWorkflowParams,
  policyState: GenerateResponsePolicyState,
): GenerateResponseChatWriter {
  const threadId = params.output.chat.threadId;
  requireChatWriteAccess(policyState, threadId);

  let postId = params.output.chat.postId ?? params.responseId;
  let revision = 0;

  return {
    get postId() {
      return postId;
    },
    get revision() {
      return revision;
    },
    async start(message) {
      const result = await client.post<{ post: UIMessage & { id: string }; revision: number }>(
        "/internal/chat/streamed-posts",
        {
          author: params.agent.actingFor,
          idempotencyKey: `${params.responseId}:start`,
          message: { ...message, id: postId },
          threadId,
        },
      );
      postId = result.post.id;
      revision = result.revision;
    },
    async apply(message, metadata) {
      const result = await client.post<{ revision: number }>(
        `/internal/chat/posts/${encodeURIComponent(postId)}/deltas`,
        {
          expectedRevision: revision,
          message: { ...message, id: postId },
          model: metadata?.model,
          usage: metadata?.usage,
        },
      );
      revision = result.revision;
    },
    async complete() {
      const result = await client.post<{ post: UIMessage }>(
        `/internal/chat/posts/${encodeURIComponent(postId)}/complete`,
        {
          expectedRevision: revision,
          idempotencyKey: `${params.responseId}:complete`,
        },
      );
      return result.post;
    },
    async abort() {
      await client.post(`/internal/chat/posts/${encodeURIComponent(postId)}/abort`, {});
    },
  };
}
