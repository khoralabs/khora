import type {
  AddChannelMemberInput,
  AddThreadParticipantInput,
  AppendPostInput,
  AppendPostResult,
  Channel,
  ChatAclEvent,
  ChatPersistence,
  CreateChannelInput,
  CreateThreadInput,
  DeletePostInput,
  EditPostInput,
  EditPostResult,
  ListPostsInput,
  ListThreadsInput,
  Post,
  PostPage,
  PostVersion,
  RemoveChannelMemberInput,
  RemoveThreadParticipantInput,
  ScopeRef,
  Thread,
  ThreadHead,
  ThreadPage,
} from "@khoralabs/chat-core";
import {
  ChatConflictError,
  ChatNotFoundError,
  createId,
  postFromVersion,
  scopeKey,
  scopeRefFromKey,
  walkLineageFromHead,
} from "@khoralabs/chat-core";
import { BaseChatPersistence } from "./base-persistence.ts";
import { buildAclEventContentHash, prepareAppendPost, prepareEditPost } from "./helpers.ts";

const DEFAULT_HEAD_NAME = "default";

type IdempotencyRecord = {
  kind: "append" | "edit";
  post: Post;
  head: ThreadHead;
};

export class MemoryChatPersistence extends BaseChatPersistence implements ChatPersistence {
  private readonly channels = new Map<string, Channel>();
  private readonly threads = new Map<string, Thread>();
  private readonly posts = new Map<string, { index: number; deletedAtMs?: number | null }>();
  private readonly versions = new Map<string, PostVersion>();
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

  async getPost(id: string): Promise<Post | null> {
    const record = this.posts.get(id);
    if (!record) return null;
    const latestVersion = [...this.versions.values()]
      .filter((version) => version.postId === id)
      .sort((a, b) => b.createdAtMs - a.createdAtMs)[0];
    if (!latestVersion) return null;
    return postFromVersion(latestVersion, record.index, record.deletedAtMs);
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
    if (!head) return { items: [], nextCursor: null };

    const lineage = walkLineageFromHead(head.headPostVersionId, this.versions);
    const limit = input.limit ?? 50;
    const start = input.cursor ? Number.parseInt(input.cursor, 10) : 0;
    const slice = lineage.slice(start, start + limit);
    const items = slice.map((version) => {
      const record = this.posts.get(version.postId);
      if (!record) throw new ChatNotFoundError("post", version.postId);
      return postFromVersion(version, record.index, record.deletedAtMs);
    });
    const nextCursor = start + limit < lineage.length ? String(start + limit) : null;
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
      createdAtMs: prepared.createdAtMs,
    };

    this.posts.set(prepared.postId, { index: nextIndex });
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
    const deletedAtMs = input.deletedAtMs ?? Date.now();
    this.posts.set(input.postId, {
      index: post.index,
      deletedAtMs,
    });
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
}

export function createMemoryChatPersistence(): MemoryChatPersistence {
  return new MemoryChatPersistence();
}
