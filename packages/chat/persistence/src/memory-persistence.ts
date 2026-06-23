import type {
  AbortStreamedPostInput,
  AbortStreamedPostResult,
  AddChannelMemberInput,
  AddThreadParticipantInput,
  AppendPostInput,
  AppendPostResult,
  ApplyPostDeltaInput,
  ApplyPostDeltaResult,
  Channel,
  ChatAclEvent,
  ChatPersistence,
  CompleteStreamedPostInput,
  CompleteStreamedPostResult,
  CreateChannelInput,
  CreateThreadInput,
  DeletePostInput,
  EditPostInput,
  EditPostResult,
  ListPostsInput,
  ListThreadsInput,
  Mention,
  Post,
  PostModelMetadata,
  PostPage,
  PostStatus,
  PostStreamEvent,
  PostUsage,
  PostVersion,
  RemoveChannelMemberInput,
  RemoveThreadParticipantInput,
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
  ChatValidationError,
  createId,
  mergeThreadPostsForList,
  postFromVersion,
  rebuildStreamCacheFromEvents,
  scopeKey,
  scopeRefFromKey,
  streamingPostFromCache,
  walkLineageFromHead,
} from "@khoralabs/chat-core";
import type { UIMessage } from "ai";
import { BaseChatPersistence } from "./base-persistence.ts";
import { buildAclEventContentHash, prepareAppendPost, prepareEditPost } from "./helpers.ts";

const DEFAULT_HEAD_NAME = "default";

type PostRecord = {
  threadId: string;
  index: number;
  status: PostStatus;
  author: ScopeRef;
  message?: UIMessage;
  mentions?: Mention[];
  model?: PostModelMetadata;
  usage?: PostUsage;
  streamRevision: number;
  completedVersionId?: string | null;
  createdAtMs: number;
  updatedAtMs?: number | null;
  deletedAtMs?: number | null;
};

type IdempotencyRecord = {
  kind: "append" | "edit";
  post: Post;
  head: ThreadHead;
};

export class MemoryChatPersistence extends BaseChatPersistence implements ChatPersistence {
  private readonly channels = new Map<string, Channel>();
  private readonly threads = new Map<string, Thread>();
  private readonly posts = new Map<string, PostRecord>();
  private readonly versions = new Map<string, PostVersion>();
  private readonly streamEvents: PostStreamEvent[] = [];
  private readonly streamIdempotency = new Map<
    string,
    { postId: string; revision: number; eventId: string }
  >();
  private readonly heads = new Map<string, ThreadHead>();
  private readonly channelMembers = new Map<
    string,
    Map<string, { role: string; createdAtMs: number }>
  >();
  private readonly threadParticipants = new Map<
    string,
    Map<string, { role: string; createdAtMs: number }>
  >();
  private readonly aclEvents: ChatAclEvent[] = [];
  private readonly idempotency = new Map<string, IdempotencyRecord>();
  private readonly threadIndexes = new Map<string, number>();

  async createChannel(input: CreateChannelInput): Promise<Channel> {
    const channel: Channel = {
      id: input.id ?? createId(),
      metadata: input.metadata,
      createdAtMs: Date.now(),
    };
    this.channels.set(channel.id, channel);
    return channel;
  }

  async createThread(input: CreateThreadInput): Promise<Thread> {
    this.validateCreateThreadInput(input);
    if (input.root.type === "channel") {
      await this.requireChannel(input.root.channelId);
    } else {
      await this.requirePost(input.root.postId);
    }

    const thread: Thread = {
      id: input.id ?? createId(),
      root: input.root,
      defaultHeadId: null,
      metadata: input.metadata,
      createdAtMs: Date.now(),
    };
    this.threads.set(thread.id, thread);
    this.threadIndexes.set(thread.id, 0);
    return thread;
  }

  async getChannel(id: string): Promise<Channel | null> {
    return this.channels.get(id) ?? null;
  }

  async getThread(id: string): Promise<Thread | null> {
    return this.threads.get(id) ?? null;
  }

  private postFromRecord(postId: string, record: PostRecord): Post | null {
    if (record.status === "streaming") {
      if (!record.message) return null;
      return streamingPostFromCache({
        postId,
        threadId: record.threadId,
        author: record.author,
        message: record.message,
        mentions: record.mentions,
        model: record.model,
        usage: record.usage,
        index: record.index,
        streamRevision: record.streamRevision,
        createdAtMs: record.createdAtMs,
        updatedAtMs: record.updatedAtMs,
        deletedAtMs: record.deletedAtMs,
      });
    }
    if (record.status === "aborted") {
      if (!record.message) return null;
      return {
        ...record.message,
        id: postId,
        status: "aborted",
        threadId: record.threadId,
        author: record.author,
        mentions: record.mentions,
        model: record.model,
        usage: record.usage,
        index: record.index,
        streamRevision: record.streamRevision,
        createdAtMs: record.createdAtMs,
        updatedAtMs: record.updatedAtMs,
        deletedAtMs: record.deletedAtMs,
      };
    }
    const version = record.completedVersionId
      ? this.versions.get(record.completedVersionId)
      : [...this.versions.values()]
          .filter((item) => item.postId === postId)
          .sort((a, b) => b.createdAtMs - a.createdAtMs)[0];
    if (!version) return null;
    return postFromVersion(version, record.index, record.deletedAtMs);
  }

  async getPost(id: string): Promise<Post | null> {
    const record = this.posts.get(id);
    if (!record) return null;
    return this.postFromRecord(id, record);
  }

  async getPostVersion(id: string): Promise<PostVersion | null> {
    return this.versions.get(id) ?? null;
  }

  async getThreadHead(threadId: string, headId?: string): Promise<ThreadHead | null> {
    const thread = await this.requireThread(threadId);
    const resolvedHeadId = headId ?? thread.defaultHeadId;
    if (!resolvedHeadId) return null;
    const head = this.heads.get(resolvedHeadId);
    return head?.threadId === threadId ? head : null;
  }

  async listThreads(input: ListThreadsInput): Promise<ThreadPage> {
    const limit = input.limit ?? 50;
    let items = [...this.threads.values()];
    if (input.channelId) {
      items = items.filter(
        (thread) => thread.root.type === "channel" && thread.root.channelId === input.channelId,
      );
    }
    if (input.postId) {
      items = items.filter(
        (thread) => thread.root.type === "post" && thread.root.postId === input.postId,
      );
    }
    items.sort((a, b) => a.createdAtMs - b.createdAtMs);
    const start = input.cursor ? Number.parseInt(input.cursor, 10) : 0;
    const page = items.slice(start, start + limit);
    const nextCursor = start + limit < items.length ? String(start + limit) : null;
    return { items: page, nextCursor };
  }

  async listPosts(input: ListPostsInput): Promise<PostPage> {
    const thread = await this.requireThread(input.threadId);
    const head = input.headPostVersionId
      ? ({
          id: "inline",
          threadId: input.threadId,
          name: "inline",
          headPostVersionId: input.headPostVersionId,
          createdAtMs: 0,
        } satisfies ThreadHead)
      : await this.getThreadHead(input.threadId, input.headId ?? thread.defaultHeadId ?? undefined);

    const lineagePosts = head
      ? walkLineageFromHead(head.headPostVersionId, this.versions).flatMap((version) => {
          const record = this.posts.get(version.postId);
          if (!record) return [];
          const post = postFromVersion(version, record.index, record.deletedAtMs);
          return [{ index: record.index, post }];
        })
      : [];

    const activePosts = [...this.posts.entries()]
      .filter(([, record]) => record.threadId === input.threadId && record.status !== "complete")
      .map(([postId, record]) => this.postFromRecord(postId, record))
      .filter(
        (post): post is Extract<Post, { status: "streaming" | "aborted" }> =>
          post !== null && (post.status === "streaming" || post.status === "aborted"),
      );

    const merged = mergeThreadPostsForList(lineagePosts, activePosts);
    const limit = input.limit ?? 50;
    const start = input.cursor ? Number.parseInt(input.cursor, 10) : 0;
    const items = merged.slice(start, start + limit);
    const nextCursor = start + limit < merged.length ? String(start + limit) : null;
    return { items, nextCursor };
  }

  async appendPost(input: AppendPostInput): Promise<AppendPostResult> {
    if (input.idempotencyKey) {
      const existing = this.idempotency.get(input.idempotencyKey);
      if (existing?.kind === "append") {
        return { ok: true, post: existing.post, head: existing.head };
      }
    }

    const thread = await this.requireThread(input.threadId);
    const currentHead = thread.defaultHeadId ? this.heads.get(thread.defaultHeadId) : null;

    if (
      input.expectedHeadPostVersionId !== undefined &&
      (currentHead?.headPostVersionId ?? null) !== (input.expectedHeadPostVersionId ?? null)
    ) {
      if (!currentHead) {
        throw new ChatConflictError("head_conflict", "expected head but thread is empty");
      }
      return { ok: false, reason: "head_conflict", currentHead };
    }

    const previousVersion = currentHead ? this.versions.get(currentHead.headPostVersionId) : null;

    const prepared = prepareAppendPost({
      ...input,
      previousPostVersionId: previousVersion?.id ?? null,
      previousLineageHash: previousVersion?.lineageHash ?? null,
    });

    const nextIndex = (this.threadIndexes.get(input.threadId) ?? 0) + 1;
    this.threadIndexes.set(input.threadId, nextIndex);

    const version: PostVersion = {
      ...prepared.message,
      id: prepared.versionId,
      postId: prepared.postId,
      threadId: prepared.threadId,
      parentVersionId: null,
      previousPostVersionId: prepared.previousPostVersionId,
      author: prepared.author,
      contentHash: prepared.contentHash,
      lineageHash: prepared.lineageHash,
      mentions: prepared.mentions,
      model: prepared.model,
      usage: prepared.usage,
      createdAtMs: prepared.createdAtMs,
    };

    this.posts.set(prepared.postId, {
      threadId: input.threadId,
      index: nextIndex,
      status: "complete",
      author: prepared.author,
      streamRevision: 0,
      completedVersionId: version.id,
      createdAtMs: prepared.createdAtMs,
      updatedAtMs: null,
      deletedAtMs: null,
    });
    this.versions.set(version.id, version);

    const head: ThreadHead = {
      id: currentHead?.id ?? createId(),
      threadId: input.threadId,
      name: currentHead?.name ?? DEFAULT_HEAD_NAME,
      headPostVersionId: version.id,
      createdAtMs: currentHead?.createdAtMs ?? prepared.createdAtMs,
    };
    this.heads.set(head.id, head);
    this.threads.set(input.threadId, {
      ...thread,
      defaultHeadId: head.id,
    });

    const post = postFromVersion(version, nextIndex);
    if (input.idempotencyKey) {
      this.idempotency.set(input.idempotencyKey, {
        kind: "append",
        post,
        head,
      });
    }
    return { ok: true, post, head };
  }

  async editPost(input: EditPostInput): Promise<EditPostResult> {
    if (input.idempotencyKey) {
      const existing = this.idempotency.get(input.idempotencyKey);
      if (existing?.kind === "edit") {
        return { ok: true, post: existing.post, head: existing.head };
      }
    }

    const parentVersion = await this.getPostVersion(input.parentVersionId);
    if (!parentVersion) {
      throw new ChatNotFoundError("post_version", input.parentVersionId);
    }

    const thread = await this.requireThread(parentVersion.threadId);
    const currentHead = thread.defaultHeadId ? this.heads.get(thread.defaultHeadId) : null;

    if (
      input.expectedHeadPostVersionId !== undefined &&
      (currentHead?.headPostVersionId ?? null) !== (input.expectedHeadPostVersionId ?? null)
    ) {
      if (!currentHead) {
        throw new ChatConflictError("head_conflict", "expected head but thread is empty");
      }
      return { ok: false, reason: "head_conflict", currentHead };
    }

    const previousInChain = parentVersion.previousPostVersionId
      ? (this.versions.get(parentVersion.previousPostVersionId) ?? null)
      : null;

    const prepared = prepareEditPost({
      ...input,
      threadId: parentVersion.threadId,
      previousPostVersionId: parentVersion.previousPostVersionId ?? null,
      previousLineageHash: previousInChain?.lineageHash ?? null,
    });

    const record = this.posts.get(input.postId);
    if (!record) throw new ChatNotFoundError("post", input.postId);

    const version: PostVersion = {
      ...prepared.message,
      id: prepared.versionId,
      postId: prepared.postId,
      threadId: prepared.threadId,
      parentVersionId: prepared.parentVersionId,
      previousPostVersionId: prepared.previousPostVersionId,
      author: prepared.author,
      contentHash: prepared.contentHash,
      lineageHash: prepared.lineageHash,
      mentions: prepared.mentions,
      model: prepared.model,
      usage: prepared.usage,
      createdAtMs: prepared.createdAtMs,
    };
    this.versions.set(version.id, version);

    let head: ThreadHead;
    if (currentHead?.headPostVersionId === input.parentVersionId) {
      head = {
        ...currentHead,
        headPostVersionId: version.id,
      };
      this.heads.set(head.id, head);
    } else if (currentHead) {
      head = currentHead;
    } else {
      head = {
        id: createId(),
        threadId: parentVersion.threadId,
        name: DEFAULT_HEAD_NAME,
        headPostVersionId: version.id,
        createdAtMs: prepared.createdAtMs,
      };
      this.heads.set(head.id, head);
      this.threads.set(parentVersion.threadId, {
        ...thread,
        defaultHeadId: head.id,
      });
    }

    const post = postFromVersion(version, record.index, record.deletedAtMs);
    if (input.idempotencyKey) {
      this.idempotency.set(input.idempotencyKey, {
        kind: "edit",
        post,
        head,
      });
    }
    return { ok: true, post, head };
  }

  async deletePost(input: DeletePostInput): Promise<Post> {
    const post = await this.requirePost(input.postId);
    const record = this.posts.get(input.postId);
    if (!record) throw new ChatNotFoundError("post", input.postId);
    const deletedAtMs = input.deletedAtMs ?? Date.now();
    this.posts.set(input.postId, { ...record, deletedAtMs });
    return { ...post, deletedAtMs };
  }

  async addChannelMember(input: AddChannelMemberInput): Promise<ChatAclEvent> {
    await this.requireChannel(input.channelId);
    const members = this.channelMembers.get(input.channelId) ?? new Map();
    members.set(scopeKey(input.scope), {
      role: input.role,
      createdAtMs: Date.now(),
    });
    this.channelMembers.set(input.channelId, members);

    const previousAclEventId =
      this.aclEvents.length > 0 ? this.aclEvents[this.aclEvents.length - 1]?.id : null;
    const event: ChatAclEvent = {
      id: createId(),
      type: "channel.member.added",
      channelId: input.channelId,
      scope: input.scope,
      role: input.role,
      actor: input.actor,
      previousAclEventId,
      contentHash: buildAclEventContentHash({
        type: "channel.member.added",
        targetType: "channel",
        targetId: input.channelId,
        scope: input.scope,
        role: input.role,
        actor: input.actor,
        previousAclEventId,
      }),
      signature: input.signature,
      createdAtMs: Date.now(),
    };
    this.aclEvents.push(event);
    return event;
  }

  async removeChannelMember(input: RemoveChannelMemberInput): Promise<ChatAclEvent> {
    await this.requireChannel(input.channelId);
    const members = this.channelMembers.get(input.channelId);
    members?.delete(scopeKey(input.scope));

    const previousAclEventId =
      this.aclEvents.length > 0 ? this.aclEvents[this.aclEvents.length - 1]?.id : null;
    const event: ChatAclEvent = {
      id: createId(),
      type: "channel.member.removed",
      channelId: input.channelId,
      scope: input.scope,
      actor: input.actor,
      previousAclEventId,
      contentHash: buildAclEventContentHash({
        type: "channel.member.removed",
        targetType: "channel",
        targetId: input.channelId,
        scope: input.scope,
        actor: input.actor,
        previousAclEventId,
      }),
      signature: input.signature,
      createdAtMs: Date.now(),
    };
    this.aclEvents.push(event);
    return event;
  }

  async addThreadParticipant(input: AddThreadParticipantInput): Promise<ChatAclEvent> {
    await this.requireThread(input.threadId);
    const participants = this.threadParticipants.get(input.threadId) ?? new Map();
    participants.set(scopeKey(input.scope), {
      role: input.role,
      createdAtMs: Date.now(),
    });
    this.threadParticipants.set(input.threadId, participants);

    const previousAclEventId =
      this.aclEvents.length > 0 ? this.aclEvents[this.aclEvents.length - 1]?.id : null;
    const event: ChatAclEvent = {
      id: createId(),
      type: "thread.participant.added",
      threadId: input.threadId,
      scope: input.scope,
      role: input.role,
      actor: input.actor,
      previousAclEventId,
      contentHash: buildAclEventContentHash({
        type: "thread.participant.added",
        targetType: "thread",
        targetId: input.threadId,
        scope: input.scope,
        role: input.role,
        actor: input.actor,
        previousAclEventId,
      }),
      signature: input.signature,
      createdAtMs: Date.now(),
    };
    this.aclEvents.push(event);
    return event;
  }

  async removeThreadParticipant(input: RemoveThreadParticipantInput): Promise<ChatAclEvent> {
    await this.requireThread(input.threadId);
    const participants = this.threadParticipants.get(input.threadId);
    participants?.delete(scopeKey(input.scope));

    const previousAclEventId =
      this.aclEvents.length > 0 ? this.aclEvents[this.aclEvents.length - 1]?.id : null;
    const event: ChatAclEvent = {
      id: createId(),
      type: "thread.participant.removed",
      threadId: input.threadId,
      scope: input.scope,
      actor: input.actor,
      previousAclEventId,
      contentHash: buildAclEventContentHash({
        type: "thread.participant.removed",
        targetType: "thread",
        targetId: input.threadId,
        scope: input.scope,
        actor: input.actor,
        previousAclEventId,
      }),
      signature: input.signature,
      createdAtMs: Date.now(),
    };
    this.aclEvents.push(event);
    return event;
  }

  async createThreadHead(input: {
    threadId: string;
    name: string;
    headPostVersionId: string;
  }): Promise<ThreadHead> {
    await this.requireThread(input.threadId);
    const version = await this.getPostVersion(input.headPostVersionId);
    if (!version) {
      throw new ChatNotFoundError("post_version", input.headPostVersionId);
    }
    const head: ThreadHead = {
      id: createId(),
      threadId: input.threadId,
      name: input.name,
      headPostVersionId: input.headPostVersionId,
      createdAtMs: Date.now(),
    };
    this.heads.set(head.id, head);
    return head;
  }

  async listChannelMembers(channelId: string): Promise<ScopeRef[]> {
    const members = this.channelMembers.get(channelId);
    if (!members) return [];
    return [...members.keys()].map(scopeRefFromKey);
  }

  async listThreadParticipants(threadId: string): Promise<ScopeRef[]> {
    const participants = this.threadParticipants.get(threadId);
    if (!participants) return [];
    return [...participants.keys()].map(scopeRefFromKey);
  }

  async listAclEvents(input: {
    channelId?: string;
    threadId?: string;
    limit?: number;
  }): Promise<ChatAclEvent[]> {
    let events = [...this.aclEvents];
    if (input.channelId) {
      events = events.filter(
        (event) =>
          event.type.startsWith("channel.") &&
          "channelId" in event &&
          event.channelId === input.channelId,
      );
    }
    if (input.threadId) {
      events = events.filter(
        (event) =>
          event.type.startsWith("thread.") &&
          "threadId" in event &&
          event.threadId === input.threadId,
      );
    }
    return events.slice(0, input.limit ?? events.length);
  }

  async listPostStreamEvents(postId: string): Promise<PostStreamEvent[]> {
    return this.streamEvents
      .filter((event) => event.postId === postId)
      .sort((a, b) => a.revision - b.revision);
  }

  async startStreamedPost(input: StartStreamedPostInput): Promise<StartStreamedPostResult> {
    if (input.idempotencyKey) {
      const existing = this.streamIdempotency.get(input.idempotencyKey);
      if (existing) {
        const post = await this.getPost(existing.postId);
        if (post?.status !== "streaming") {
          throw new ChatConflictError("idempotency_mismatch", "idempotency key reused");
        }
        return { post, revision: existing.revision };
      }
    }

    await this.requireThread(input.threadId);
    const postId = input.message.id || createId();
    const nextIndex = (this.threadIndexes.get(input.threadId) ?? 0) + 1;
    this.threadIndexes.set(input.threadId, nextIndex);
    const createdAtMs = Date.now();
    const message: UIMessage = { ...input.message, id: postId };
    const revision = 1;
    const event: PostStreamEvent = {
      id: createId(),
      postId,
      threadId: input.threadId,
      eventType: "stream.started",
      revision,
      message,
      mentions: input.mentions,
      model: input.model,
      usage: input.usage,
      idempotencyKey: input.idempotencyKey,
      createdAtMs,
    };
    this.streamEvents.push(event);
    this.posts.set(postId, {
      threadId: input.threadId,
      index: nextIndex,
      status: "streaming",
      author: input.author,
      message,
      mentions: input.mentions,
      model: input.model,
      usage: input.usage,
      streamRevision: revision,
      createdAtMs,
      updatedAtMs: null,
      deletedAtMs: null,
    });
    if (input.idempotencyKey) {
      this.streamIdempotency.set(input.idempotencyKey, {
        postId,
        revision,
        eventId: event.id,
      });
    }
    const post = streamingPostFromCache({
      postId,
      threadId: input.threadId,
      author: input.author,
      message,
      mentions: input.mentions,
      model: input.model,
      usage: input.usage,
      index: nextIndex,
      streamRevision: revision,
      createdAtMs,
    });
    return { post, revision };
  }

  async applyPostDelta(input: ApplyPostDeltaInput): Promise<ApplyPostDeltaResult> {
    if (input.idempotencyKey) {
      const existing = this.streamIdempotency.get(input.idempotencyKey);
      if (existing && existing.postId === input.postId) {
        const post = await this.getPost(input.postId);
        if (post?.status !== "streaming") {
          throw new ChatConflictError("idempotency_mismatch", "idempotency key reused");
        }
        return { post, revision: existing.revision };
      }
    }

    const record = this.posts.get(input.postId);
    if (!record) throw new ChatNotFoundError("post", input.postId);
    if (record.status !== "streaming") {
      throw new ChatValidationError(`post ${input.postId} is not streaming`);
    }
    if (input.expectedRevision !== undefined && record.streamRevision !== input.expectedRevision) {
      throw new ChatConflictError(
        "stream_revision_conflict",
        `expected revision ${input.expectedRevision}, current ${record.streamRevision}`,
      );
    }

    const revision = record.streamRevision + 1;
    const updatedAtMs = Date.now();
    const message: UIMessage = { ...input.message, id: input.postId };
    const event: PostStreamEvent = {
      id: createId(),
      postId: input.postId,
      threadId: record.threadId,
      eventType: "stream.delta",
      revision,
      message,
      delta: input.delta,
      mentions: input.mentions ?? record.mentions,
      model: input.model ?? record.model,
      usage: input.usage ?? record.usage,
      idempotencyKey: input.idempotencyKey,
      createdAtMs: updatedAtMs,
    };
    this.streamEvents.push(event);
    this.posts.set(input.postId, {
      ...record,
      message,
      mentions: input.mentions ?? record.mentions,
      model: input.model ?? record.model,
      usage: input.usage ?? record.usage,
      streamRevision: revision,
      updatedAtMs,
    });
    if (input.idempotencyKey) {
      this.streamIdempotency.set(input.idempotencyKey, {
        postId: input.postId,
        revision,
        eventId: event.id,
      });
    }
    const post = streamingPostFromCache({
      postId: input.postId,
      threadId: record.threadId,
      author: record.author,
      message,
      mentions: input.mentions ?? record.mentions,
      model: input.model ?? record.model,
      usage: input.usage ?? record.usage,
      index: record.index,
      streamRevision: revision,
      createdAtMs: record.createdAtMs,
      updatedAtMs,
      deletedAtMs: record.deletedAtMs,
    });
    return { post, revision };
  }

  async completeStreamedPost(
    input: CompleteStreamedPostInput,
  ): Promise<CompleteStreamedPostResult> {
    const record = this.posts.get(input.postId);
    if (!record) throw new ChatNotFoundError("post", input.postId);
    if (record.status !== "streaming") {
      throw new ChatValidationError(`post ${input.postId} is not streaming`);
    }
    if (input.expectedRevision !== undefined && record.streamRevision !== input.expectedRevision) {
      throw new ChatConflictError(
        "stream_revision_conflict",
        `expected revision ${input.expectedRevision}, current ${record.streamRevision}`,
      );
    }
    if (!record.message) {
      throw new ChatValidationError(`post ${input.postId} has no streamed message`);
    }

    const thread = await this.requireThread(record.threadId);
    const currentHead = thread.defaultHeadId ? this.heads.get(thread.defaultHeadId) : null;
    if (
      input.expectedHeadPostVersionId !== undefined &&
      (currentHead?.headPostVersionId ?? null) !== (input.expectedHeadPostVersionId ?? null)
    ) {
      if (!currentHead) {
        throw new ChatConflictError("head_conflict", "expected head but thread is empty");
      }
      return { ok: false, reason: "head_conflict", currentHead };
    }

    const previousVersion = currentHead ? this.versions.get(currentHead.headPostVersionId) : null;
    const prepared = prepareAppendPost({
      threadId: record.threadId,
      author: record.author,
      message: record.message,
      mentions: record.mentions,
      model: record.model,
      usage: record.usage,
      previousPostVersionId: previousVersion?.id ?? null,
      previousLineageHash: previousVersion?.lineageHash ?? null,
    });

    const version: PostVersion = {
      ...prepared.message,
      id: prepared.versionId,
      postId: prepared.postId,
      threadId: prepared.threadId,
      parentVersionId: null,
      previousPostVersionId: prepared.previousPostVersionId,
      author: prepared.author,
      contentHash: prepared.contentHash,
      lineageHash: prepared.lineageHash,
      mentions: prepared.mentions,
      model: prepared.model,
      usage: prepared.usage,
      createdAtMs: prepared.createdAtMs,
    };
    this.versions.set(version.id, version);

    const head: ThreadHead = {
      id: currentHead?.id ?? createId(),
      threadId: record.threadId,
      name: currentHead?.name ?? DEFAULT_HEAD_NAME,
      headPostVersionId: version.id,
      createdAtMs: currentHead?.createdAtMs ?? prepared.createdAtMs,
    };
    this.heads.set(head.id, head);
    this.threads.set(record.threadId, { ...thread, defaultHeadId: head.id });

    const completedRevision = record.streamRevision + 1;
    const completedAtMs = Date.now();
    this.streamEvents.push({
      id: createId(),
      postId: input.postId,
      threadId: record.threadId,
      eventType: "stream.completed",
      revision: completedRevision,
      message: record.message,
      mentions: record.mentions,
      model: record.model,
      usage: record.usage,
      createdAtMs: completedAtMs,
    });
    this.posts.set(input.postId, {
      ...record,
      status: "complete",
      streamRevision: completedRevision,
      completedVersionId: version.id,
      updatedAtMs: completedAtMs,
      message: undefined,
      mentions: undefined,
    });

    const post = postFromVersion(version, record.index, record.deletedAtMs);
    return { ok: true, post, head };
  }

  async abortStreamedPost(input: AbortStreamedPostInput): Promise<AbortStreamedPostResult> {
    const record = this.posts.get(input.postId);
    if (!record) throw new ChatNotFoundError("post", input.postId);
    if (record.status !== "streaming") {
      throw new ChatValidationError(`post ${input.postId} is not streaming`);
    }
    const deletedAtMs = input.deletedAtMs ?? Date.now();
    const revision = record.streamRevision + 1;
    this.streamEvents.push({
      id: createId(),
      postId: input.postId,
      threadId: record.threadId,
      eventType: "stream.aborted",
      revision,
      message: record.message,
      mentions: record.mentions,
      model: record.model,
      usage: record.usage,
      createdAtMs: deletedAtMs,
    });
    this.posts.set(input.postId, {
      ...record,
      status: "aborted",
      streamRevision: revision,
      deletedAtMs,
      updatedAtMs: deletedAtMs,
    });
    const post = await this.getPost(input.postId);
    if (post?.status !== "aborted") {
      throw new ChatNotFoundError("post", input.postId);
    }
    return { post };
  }

  async rebuildStreamedPostCache(
    postId: string,
  ): Promise<import("@khoralabs/chat-core").StreamingPost> {
    const record = this.posts.get(postId);
    if (!record) throw new ChatNotFoundError("post", postId);
    if (record.status !== "streaming") {
      throw new ChatValidationError(`post ${postId} is not streaming`);
    }
    const events = await this.listPostStreamEvents(postId);
    const rebuilt = rebuildStreamCacheFromEvents(events);
    this.posts.set(postId, {
      ...record,
      message: rebuilt.message,
      mentions: rebuilt.mentions,
      streamRevision: rebuilt.revision,
      updatedAtMs: Date.now(),
    });
    return streamingPostFromCache({
      postId,
      threadId: record.threadId,
      author: record.author,
      message: rebuilt.message,
      mentions: rebuilt.mentions,
      index: record.index,
      streamRevision: rebuilt.revision,
      createdAtMs: record.createdAtMs,
      updatedAtMs: Date.now(),
      deletedAtMs: record.deletedAtMs,
    });
  }
}

export function createMemoryChatPersistence(): MemoryChatPersistence {
  return new MemoryChatPersistence();
}
