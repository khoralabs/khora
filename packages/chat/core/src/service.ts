import type {
  AbortStreamedPostInput,
  AbortStreamedPostResult,
  ApplyPostDeltaInput,
  ApplyPostDeltaResult,
  Channel,
  ChatAclEvent,
  ChatEvent,
  CompleteStreamedPostInput,
  Post,
  PostPage,
  ScopeRef,
  StartStreamedPostInput,
  StartStreamedPostResult,
  Thread,
  ThreadHead,
  ThreadPage,
} from "@khoralabs/chat-core";
import {
  ChatConflictError,
  ChatNotFoundError,
  type ChatSigner,
  createId,
} from "@khoralabs/chat-core";
import type {
  AddChannelMemberInput,
  AddThreadParticipantInput,
  AppendPostInput,
  ChatPersistence,
  CreateChannelInput,
  CreateThreadInput,
  DeletePostInput,
  EditPostInput,
  ListPostsInput,
  ListThreadsInput,
  RemoveChannelMemberInput,
  RemoveThreadParticipantInput,
} from "./persistence-port.ts";

export type ChatServiceOptions = {
  signer?: ChatSigner;
  generateId?: () => string;
  now?: () => number;
  onEvent?: (event: ChatEvent) => void;
};

export type ChatService = {
  createChannel(input: CreateChannelInput): Promise<Channel>;
  createThread(input: CreateThreadInput): Promise<Thread>;
  getChannel(id: string): Promise<Channel>;
  getThread(id: string): Promise<Thread>;
  getPost(id: string): Promise<Post>;
  listThreads(input: ListThreadsInput): Promise<ThreadPage>;
  listPosts(input: ListPostsInput): Promise<PostPage>;
  appendPost(input: AppendPostInput): Promise<{ post: Post; head: ThreadHead }>;
  editPost(input: EditPostInput): Promise<{ post: Post; head: ThreadHead }>;
  deletePost(input: DeletePostInput): Promise<Post>;
  addChannelMember(input: AddChannelMemberInput): Promise<ChatAclEvent>;
  removeChannelMember(input: RemoveChannelMemberInput): Promise<ChatAclEvent>;
  addThreadParticipant(input: AddThreadParticipantInput): Promise<ChatAclEvent>;
  removeThreadParticipant(input: RemoveThreadParticipantInput): Promise<ChatAclEvent>;
  createThreadHead(input: {
    threadId: string;
    name: string;
    headPostVersionId: string;
  }): Promise<ThreadHead>;
  listChannelMembers(channelId: string): Promise<ScopeRef[]>;
  listThreadParticipants(threadId: string): Promise<ScopeRef[]>;
  startStreamedPost(input: StartStreamedPostInput): Promise<StartStreamedPostResult>;
  applyPostDelta(input: ApplyPostDeltaInput): Promise<ApplyPostDeltaResult>;
  completeStreamedPost(input: CompleteStreamedPostInput): Promise<{ post: Post; head: ThreadHead }>;
  abortStreamedPost(input: AbortStreamedPostInput): Promise<AbortStreamedPostResult["post"]>;
};

export function createChatService(
  persistence: ChatPersistence,
  options: ChatServiceOptions = {},
): ChatService {
  const emit = (event: ChatEvent) => {
    options.onEvent?.(event);
  };

  async function requireChannel(id: string): Promise<Channel> {
    const channel = await persistence.getChannel(id);
    if (!channel) throw new ChatNotFoundError("channel", id);
    return channel;
  }

  async function requireThread(id: string): Promise<Thread> {
    const thread = await persistence.getThread(id);
    if (!thread) throw new ChatNotFoundError("thread", id);
    return thread;
  }

  async function requirePost(id: string): Promise<Post> {
    const post = await persistence.getPost(id);
    if (!post) throw new ChatNotFoundError("post", id);
    return post;
  }

  return {
    async createChannel(input) {
      const channel = await persistence.createChannel({
        ...input,
        id: input.id ?? options.generateId?.() ?? createId(),
      });
      emit({ type: "channel.created", channel });
      return channel;
    },

    async createThread(input) {
      const thread = await persistence.createThread({
        ...input,
        id: input.id ?? options.generateId?.() ?? createId(),
      });
      emit({ type: "thread.created", thread });
      return thread;
    },

    getChannel: requireChannel,
    getThread: requireThread,
    getPost: requirePost,

    listThreads: (input) => persistence.listThreads(input),
    listPosts: (input) => persistence.listPosts(input),

    async appendPost(input) {
      const result = await persistence.appendPost(input);
      if (!result.ok) {
        throw new ChatConflictError(
          "head_conflict",
          `head conflict: expected ${input.expectedHeadPostVersionId ?? "null"}, current ${result.currentHead.headPostVersionId}`,
        );
      }
      emit({
        type: "post.appended",
        threadId: input.threadId,
        post: result.post,
      });
      return { post: result.post, head: result.head };
    },

    async editPost(input) {
      const result = await persistence.editPost(input);
      if (!result.ok) {
        throw new ChatConflictError(
          "head_conflict",
          `head conflict during edit: current ${result.currentHead.headPostVersionId}`,
        );
      }
      emit({
        type: "post.updated",
        threadId: result.post.threadId,
        post: result.post,
      });
      return { post: result.post, head: result.head };
    },

    async deletePost(input) {
      const post = await persistence.deletePost(input);
      emit({
        type: "post.deleted",
        threadId: post.threadId,
        postId: post.id,
        deletedAtMs: post.deletedAtMs ?? Date.now(),
      });
      return post;
    },

    addChannelMember: (input) => persistence.addChannelMember(input),
    removeChannelMember: (input) => persistence.removeChannelMember(input),

    async addThreadParticipant(input) {
      const event = await persistence.addThreadParticipant(input);
      emit({
        type: "participant.added",
        threadId: input.threadId,
        scope: input.scope,
        role: input.role,
      });
      return event;
    },

    removeThreadParticipant: (input) => persistence.removeThreadParticipant(input),

    createThreadHead: (input) => persistence.createThreadHead(input),
    listChannelMembers: (channelId) => persistence.listChannelMembers(channelId),
    listThreadParticipants: (threadId) => persistence.listThreadParticipants(threadId),

    async startStreamedPost(input) {
      const result = await persistence.startStreamedPost(input);
      emit({
        type: "post.stream.started",
        threadId: input.threadId,
        post: result.post,
        revision: result.revision,
      });
      return result;
    },

    async applyPostDelta(input) {
      const record = await persistence.getPost(input.postId);
      if (!record) throw new ChatNotFoundError("post", input.postId);
      const result = await persistence.applyPostDelta(input);
      emit({
        type: "post.stream.delta",
        threadId: record.threadId,
        post: result.post,
        revision: result.revision,
      });
      return result;
    },

    async completeStreamedPost(input) {
      const record = await persistence.getPost(input.postId);
      if (!record) throw new ChatNotFoundError("post", input.postId);
      const streamRevision =
        record.status === "streaming" ? record.streamRevision : input.expectedRevision;
      const result = await persistence.completeStreamedPost(input);
      if (!result.ok) {
        throw new ChatConflictError(
          "head_conflict",
          `head conflict during stream completion: current ${result.currentHead.headPostVersionId}`,
        );
      }
      emit({
        type: "post.stream.completed",
        threadId: record.threadId,
        post: result.post,
        head: result.head,
        revision: typeof streamRevision === "number" ? streamRevision + 1 : 0,
      });
      return { post: result.post, head: result.head };
    },

    async abortStreamedPost(input) {
      const record = await persistence.getPost(input.postId);
      if (!record) throw new ChatNotFoundError("post", input.postId);
      const result = await persistence.abortStreamedPost(input);
      emit({
        type: "post.stream.aborted",
        threadId: record.threadId,
        postId: input.postId,
        revision: result.post.streamRevision,
        deletedAtMs: result.post.deletedAtMs ?? Date.now(),
      });
      return result.post;
    },
  };
}
