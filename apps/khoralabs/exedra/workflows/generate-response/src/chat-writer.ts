import type { ChatService, PostModelMetadata, PostUsage } from "@khoralabs/chat-core";
import { createChatService } from "@khoralabs/chat-core";
import { MemoryChatPersistence } from "@khoralabs/chat-persistence";
import { createChatDatabase, SqliteChatPersistence } from "@khoralabs/chat-persistence-sqlite";
import type { UIMessage } from "ai";

import { type GenerateResponsePolicyState, requireChatWriteAccess } from "./policies.ts";
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

export function createDefaultChatService(): ChatService {
  const sqlitePath = process.env.GENERATE_RESPONSE_CHAT_SQLITE_PATH?.trim();
  if (sqlitePath !== undefined && sqlitePath.length > 0) {
    return createChatService(new SqliteChatPersistence(createChatDatabase(sqlitePath)));
  }
  return createChatService(new MemoryChatPersistence());
}

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
