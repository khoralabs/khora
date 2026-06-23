import type { Database } from "bun:sqlite";
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
  SignedEnvelope,
  Thread,
  ThreadHead,
  ThreadPage,
  ThreadRoot,
} from "@khoralabs/chat-core";
import {
  ChatConflictError,
  ChatNotFoundError,
  ChatValidationError,
  createId,
  mergeThreadPostsForList,
  postFromVersion,
  walkLineageFromHead,
} from "@khoralabs/chat-core";
import {
  BaseChatPersistence,
  buildAclEventContentHash,
  prepareAppendPost,
  prepareEditPost,
} from "@khoralabs/chat-persistence";
import {
  type PostRow,
  postFromRow,
  sqliteAbortStreamedPost,
  sqliteApplyPostDelta,
  sqliteCompleteStreamedPost,
  sqliteListPostStreamEvents,
  sqliteRebuildStreamedPostCache,
  sqliteStartStreamedPost,
} from "./streaming.ts";

const DEFAULT_HEAD_NAME = "default";

type ScopeRow = { scope_type: string; scope_id: string };

function parseJson<T>(value: string | null): T | undefined {
  if (!value) return undefined;
  return JSON.parse(value) as T;
}

function parseSignature(value: string | null): SignedEnvelope | undefined {
  return parseJson<SignedEnvelope>(value);
}

type AclEventRow = {
  id: string;
  target_type: string;
  target_id: string;
  event_type: string;
  actor_scope_type: string;
  actor_scope_id: string;
  subject_scope_type: string | null;
  subject_scope_id: string | null;
  role: string | null;
  previous_acl_event_id: string | null;
  content_hash: string;
  signature: string | null;
  created_at_ms: number;
};

function requireAclSubjectScope(scope: ScopeRef | undefined, eventId: string): ScopeRef {
  if (!scope) {
    throw new ChatValidationError(`ACL event ${eventId} is missing subject scope`);
  }
  return scope;
}

function requireAclRole(role: string | null, eventId: string): string {
  if (!role) {
    throw new ChatValidationError(`ACL event ${eventId} is missing role`);
  }
  return role;
}

function aclEventFromRow(row: AclEventRow): ChatAclEvent {
  const actor = scopeFromRow({
    scope_type: row.actor_scope_type,
    scope_id: row.actor_scope_id,
  });
  const scope =
    row.subject_scope_type && row.subject_scope_id
      ? scopeFromRow({
          scope_type: row.subject_scope_type,
          scope_id: row.subject_scope_id,
        })
      : undefined;
  const base = {
    id: row.id,
    previousAclEventId: row.previous_acl_event_id,
    contentHash: row.content_hash,
    signature: parseSignature(row.signature),
    createdAtMs: row.created_at_ms,
    actor,
  };
  if (row.event_type === "channel.member.added") {
    return {
      ...base,
      type: "channel.member.added",
      channelId: row.target_id,
      scope: requireAclSubjectScope(scope, row.id),
      role: requireAclRole(row.role, row.id),
    };
  }
  if (row.event_type === "channel.member.removed") {
    return {
      ...base,
      type: "channel.member.removed",
      channelId: row.target_id,
      scope: requireAclSubjectScope(scope, row.id),
    };
  }
  if (row.event_type === "thread.participant.added") {
    return {
      ...base,
      type: "thread.participant.added",
      threadId: row.target_id,
      scope: requireAclSubjectScope(scope, row.id),
      role: requireAclRole(row.role, row.id),
    };
  }
  return {
    ...base,
    type: "thread.participant.removed",
    threadId: row.target_id,
    scope: requireAclSubjectScope(scope, row.id),
  };
}

function scopeFromRow(row: ScopeRow): ScopeRef {
  return { type: row.scope_type, id: row.scope_id };
}

function encodeThreadRoot(root: ThreadRoot): {
  root_type: string;
  root_id: string;
  root_version_id: string | null;
} {
  if (root.type === "channel") {
    return {
      root_type: "channel",
      root_id: root.channelId,
      root_version_id: null,
    };
  }
  return {
    root_type: "post",
    root_id: root.postId,
    root_version_id: root.versionId ?? null,
  };
}

function decodeThreadRoot(row: {
  root_type: string;
  root_id: string;
  root_version_id: string | null;
}): ThreadRoot {
  if (row.root_type === "channel") {
    return { type: "channel", channelId: row.root_id };
  }
  return {
    type: "post",
    postId: row.root_id,
    versionId: row.root_version_id ?? undefined,
  };
}

function versionFromRow(row: {
  id: string;
  post_id: string;
  thread_id: string;
  parent_version_id: string | null;
  previous_post_version_id: string | null;
  author_scope_type: string;
  author_scope_id: string;
  message: string;
  mentions: string | null;
  model: string | null;
  usage: string | null;
  content_hash: string;
  lineage_hash: string;
  signature: string | null;
  created_at_ms: number;
}): PostVersion {
  const message = JSON.parse(row.message) as PostVersion;
  return {
    ...message,
    id: row.id,
    postId: row.post_id,
    threadId: row.thread_id,
    parentVersionId: row.parent_version_id,
    previousPostVersionId: row.previous_post_version_id,
    author: scopeFromRow({
      scope_type: row.author_scope_type,
      scope_id: row.author_scope_id,
    }),
    contentHash: row.content_hash,
    lineageHash: row.lineage_hash,
    signature: parseSignature(row.signature),
    mentions: parseJson(row.mentions),
    model: parseJson(row.model),
    usage: parseJson(row.usage),
    createdAtMs: row.created_at_ms,
  };
}

export class SqliteChatPersistence extends BaseChatPersistence implements ChatPersistence {
  constructor(private readonly db: Database) {
    super();
  }

  private getPostVersionSync(id: string): PostVersion | null {
    const row = this.db.prepare("SELECT * FROM chat_post_versions WHERE id = ?").get(id) as
      | Parameters<typeof versionFromRow>[0]
      | null;
    return row ? versionFromRow(row) : null;
  }

  async createChannel(input: CreateChannelInput): Promise<Channel> {
    const channel: Channel = {
      id: input.id ?? createId(),
      metadata: input.metadata,
      createdAtMs: Date.now(),
    };
    this.db
      .prepare("INSERT INTO chat_channels (id, metadata, created_at_ms) VALUES (?, ?, ?)")
      .run(
        channel.id,
        channel.metadata ? JSON.stringify(channel.metadata) : null,
        channel.createdAtMs,
      );
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
    const encoded = encodeThreadRoot(thread.root);
    this.db
      .prepare(
        `INSERT INTO chat_threads
         (id, root_type, root_id, root_version_id, default_head_id, metadata, created_at_ms, archived_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        thread.id,
        encoded.root_type,
        encoded.root_id,
        encoded.root_version_id,
        null,
        thread.metadata ? JSON.stringify(thread.metadata) : null,
        thread.createdAtMs,
        null,
      );
    return thread;
  }

  async getChannel(id: string): Promise<Channel | null> {
    const row = this.db
      .prepare("SELECT id, metadata, created_at_ms FROM chat_channels WHERE id = ?")
      .get(id) as { id: string; metadata: string | null; created_at_ms: number } | null;
    if (!row) return null;
    return {
      id: row.id,
      metadata: parseJson(row.metadata),
      createdAtMs: row.created_at_ms,
    };
  }

  async getThread(id: string): Promise<Thread | null> {
    const row = this.db
      .prepare(
        `SELECT id, root_type, root_id, root_version_id, default_head_id, metadata, created_at_ms, archived_at_ms
         FROM chat_threads WHERE id = ?`,
      )
      .get(id) as {
      id: string;
      root_type: string;
      root_id: string;
      root_version_id: string | null;
      default_head_id: string | null;
      metadata: string | null;
      created_at_ms: number;
      archived_at_ms: number | null;
    } | null;
    if (!row) return null;
    return {
      id: row.id,
      root: decodeThreadRoot(row),
      defaultHeadId: row.default_head_id,
      metadata: parseJson(row.metadata),
      createdAtMs: row.created_at_ms,
      archivedAtMs: row.archived_at_ms ?? undefined,
    };
  }

  async getPost(id: string): Promise<Post | null> {
    const postRow = this.db
      .prepare(
        `SELECT id, thread_id, post_index, status, stream_message, stream_mentions, stream_model, stream_usage,
                stream_author_scope_type, stream_author_scope_id, stream_revision,
                completed_version_id, created_at_ms, updated_at_ms, deleted_at_ms
         FROM chat_posts WHERE id = ?`,
      )
      .get(id) as PostRow | null;
    if (!postRow) return null;
    return postFromRow(postRow, (versionId) => this.getPostVersionSync(versionId));
  }

  async getPostVersion(id: string): Promise<PostVersion | null> {
    const row = this.db.prepare("SELECT * FROM chat_post_versions WHERE id = ?").get(id) as
      | Parameters<typeof versionFromRow>[0]
      | null;
    return row ? versionFromRow(row) : null;
  }

  async getThreadHead(threadId: string, headId?: string): Promise<ThreadHead | null> {
    const thread = await this.requireThread(threadId);
    const resolvedHeadId = headId ?? thread.defaultHeadId;
    if (!resolvedHeadId) return null;
    const row = this.db
      .prepare("SELECT * FROM chat_thread_heads WHERE id = ?")
      .get(resolvedHeadId) as {
      id: string;
      thread_id: string;
      name: string;
      head_post_version_id: string;
      created_at_ms: number;
    } | null;
    if (!row || row.thread_id !== threadId) return null;
    return {
      id: row.id,
      threadId: row.thread_id,
      name: row.name,
      headPostVersionId: row.head_post_version_id,
      createdAtMs: row.created_at_ms,
    };
  }

  async listThreads(input: ListThreadsInput): Promise<ThreadPage> {
    const limit = input.limit ?? 50;
    const start = input.cursor ? Number.parseInt(input.cursor, 10) : 0;
    let rows: Array<{
      id: string;
      root_type: string;
      root_id: string;
      root_version_id: string | null;
      default_head_id: string | null;
      metadata: string | null;
      created_at_ms: number;
      archived_at_ms: number | null;
    }>;

    if (input.channelId) {
      rows = this.db
        .prepare(
          `SELECT * FROM chat_threads
           WHERE root_type = 'channel' AND root_id = ?
           ORDER BY created_at_ms ASC`,
        )
        .all(input.channelId) as typeof rows;
    } else if (input.postId) {
      rows = this.db
        .prepare(
          `SELECT * FROM chat_threads
           WHERE root_type = 'post' AND root_id = ?
           ORDER BY created_at_ms ASC`,
        )
        .all(input.postId) as typeof rows;
    } else {
      rows = this.db
        .prepare("SELECT * FROM chat_threads ORDER BY created_at_ms ASC")
        .all() as typeof rows;
    }

    const page = rows.slice(start, start + limit);
    return {
      items: page.map((row) => ({
        id: row.id,
        root: decodeThreadRoot(row),
        defaultHeadId: row.default_head_id,
        metadata: parseJson(row.metadata),
        createdAtMs: row.created_at_ms,
        archivedAtMs: row.archived_at_ms ?? undefined,
      })),
      nextCursor: start + limit < rows.length ? String(start + limit) : null,
    };
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

    const versionRows = this.db
      .prepare("SELECT * FROM chat_post_versions WHERE thread_id = ?")
      .all(input.threadId) as Array<Parameters<typeof versionFromRow>[0]>;
    const versionsById = new Map(versionRows.map((row) => [row.id, versionFromRow(row)]));

    const lineagePosts = head
      ? walkLineageFromHead(head.headPostVersionId, versionsById).flatMap((version) => {
          const postRow = this.db
            .prepare("SELECT post_index, deleted_at_ms FROM chat_posts WHERE id = ?")
            .get(version.postId) as { post_index: number; deleted_at_ms: number | null } | null;
          if (!postRow) return [];
          return [
            {
              index: postRow.post_index,
              post: postFromVersion(version, postRow.post_index, postRow.deleted_at_ms),
            },
          ];
        })
      : [];

    const activeRows = this.db
      .prepare(
        `SELECT id, thread_id, post_index, status, stream_message, stream_mentions, stream_model, stream_usage,
                stream_author_scope_type, stream_author_scope_id, stream_revision,
                completed_version_id, created_at_ms, updated_at_ms, deleted_at_ms
         FROM chat_posts
         WHERE thread_id = ? AND status != 'complete'
         ORDER BY post_index ASC`,
      )
      .all(input.threadId) as PostRow[];

    const activePosts = activeRows
      .map((row) => postFromRow(row, (versionId) => this.getPostVersionSync(versionId)))
      .filter(
        (post): post is Extract<Post, { status: "streaming" | "aborted" }> =>
          post !== null && (post.status === "streaming" || post.status === "aborted"),
      );

    const merged = mergeThreadPostsForList(lineagePosts, activePosts);
    const limit = input.limit ?? 50;
    const start = input.cursor ? Number.parseInt(input.cursor, 10) : 0;
    const items = merged.slice(start, start + limit);
    return {
      items,
      nextCursor: start + limit < merged.length ? String(start + limit) : null,
    };
  }

  async appendPost(input: AppendPostInput): Promise<AppendPostResult> {
    if (input.idempotencyKey) {
      const existing = this.db
        .prepare(
          `SELECT pv.*, cp.post_index, cp.deleted_at_ms
           FROM chat_post_versions pv
           JOIN chat_posts cp ON cp.id = pv.post_id
           WHERE pv.idempotency_key = ?`,
        )
        .get(input.idempotencyKey) as
        | (Parameters<typeof versionFromRow>[0] & {
            post_index: number;
            deleted_at_ms: number | null;
          })
        | null;
      if (existing) {
        const version = versionFromRow(existing);
        const head = await this.getThreadHead(input.threadId);
        if (!head) {
          throw new ChatNotFoundError("thread_head", input.threadId);
        }
        return {
          ok: true,
          post: postFromVersion(version, existing.post_index, existing.deleted_at_ms),
          head,
        };
      }
    }

    return this.db.transaction(() => {
      const thread = this.db
        .prepare("SELECT * FROM chat_threads WHERE id = ?")
        .get(input.threadId) as {
        id: string;
        default_head_id: string | null;
      } | null;
      if (!thread) throw new ChatNotFoundError("thread", input.threadId);

      const currentHead = thread.default_head_id
        ? (this.db
            .prepare("SELECT * FROM chat_thread_heads WHERE id = ?")
            .get(thread.default_head_id) as {
            id: string;
            thread_id: string;
            name: string;
            head_post_version_id: string;
            created_at_ms: number;
          } | null)
        : null;

      if (
        input.expectedHeadPostVersionId !== undefined &&
        (currentHead?.head_post_version_id ?? null) !== (input.expectedHeadPostVersionId ?? null)
      ) {
        if (!currentHead) {
          throw new ChatConflictError("head_conflict", "expected head but thread is empty");
        }
        return {
          ok: false as const,
          reason: "head_conflict" as const,
          currentHead: {
            id: currentHead.id,
            threadId: currentHead.thread_id,
            name: currentHead.name,
            headPostVersionId: currentHead.head_post_version_id,
            createdAtMs: currentHead.created_at_ms,
          },
        };
      }

      const previousVersion = currentHead
        ? versionFromRow(
            this.db
              .prepare("SELECT * FROM chat_post_versions WHERE id = ?")
              .get(currentHead.head_post_version_id) as Parameters<typeof versionFromRow>[0],
          )
        : null;

      const prepared = prepareAppendPost({
        ...input,
        previousPostVersionId: previousVersion?.id ?? null,
        previousLineageHash: previousVersion?.lineageHash ?? null,
      });

      const maxIndexRow = this.db
        .prepare(
          "SELECT COALESCE(MAX(post_index), 0) AS max_index FROM chat_posts WHERE thread_id = ?",
        )
        .get(input.threadId) as { max_index: number };
      const nextIndex = maxIndexRow.max_index + 1;

      this.db
        .prepare(
          `INSERT INTO chat_posts
           (id, thread_id, post_index, status, stream_revision, completed_version_id,
            created_at_ms, updated_at_ms, deleted_at_ms)
           VALUES (?, ?, ?, 'complete', 0, ?, ?, NULL, NULL)`,
        )
        .run(
          prepared.postId,
          prepared.threadId,
          nextIndex,
          prepared.versionId,
          prepared.createdAtMs,
        );

      this.db
        .prepare(
          `INSERT INTO chat_post_versions
           (id, post_id, thread_id, parent_version_id, previous_post_version_id,
            author_scope_type, author_scope_id, message, mentions, model, usage, content_hash, lineage_hash,
            signature, idempotency_key, created_at_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          prepared.versionId,
          prepared.postId,
          prepared.threadId,
          null,
          prepared.previousPostVersionId,
          prepared.author.type,
          prepared.author.id,
          JSON.stringify(prepared.message),
          prepared.mentions ? JSON.stringify(prepared.mentions) : null,
          prepared.model ? JSON.stringify(prepared.model) : null,
          prepared.usage ? JSON.stringify(prepared.usage) : null,
          prepared.contentHash,
          prepared.lineageHash,
          null,
          input.idempotencyKey ?? null,
          prepared.createdAtMs,
        );

      const head: ThreadHead = currentHead
        ? {
            id: currentHead.id,
            threadId: input.threadId,
            name: currentHead.name,
            headPostVersionId: prepared.versionId,
            createdAtMs: currentHead.created_at_ms,
          }
        : {
            id: createId(),
            threadId: input.threadId,
            name: DEFAULT_HEAD_NAME,
            headPostVersionId: prepared.versionId,
            createdAtMs: prepared.createdAtMs,
          };

      if (currentHead) {
        this.db
          .prepare("UPDATE chat_thread_heads SET head_post_version_id = ? WHERE id = ?")
          .run(prepared.versionId, head.id);
      } else {
        this.db
          .prepare(
            `INSERT INTO chat_thread_heads
             (id, thread_id, name, head_post_version_id, created_at_ms)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run(head.id, head.threadId, head.name, head.headPostVersionId, head.createdAtMs);
        this.db
          .prepare("UPDATE chat_threads SET default_head_id = ? WHERE id = ?")
          .run(head.id, input.threadId);
      }

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

      return {
        ok: true as const,
        post: postFromVersion(version, nextIndex),
        head,
      };
    })();
  }

  async editPost(input: EditPostInput): Promise<EditPostResult> {
    if (input.idempotencyKey) {
      const existing = this.db
        .prepare(
          `SELECT pv.*, cp.post_index, cp.deleted_at_ms
           FROM chat_post_versions pv
           JOIN chat_posts cp ON cp.id = pv.post_id
           WHERE pv.idempotency_key = ?`,
        )
        .get(input.idempotencyKey) as
        | (Parameters<typeof versionFromRow>[0] & {
            post_index: number;
            deleted_at_ms: number | null;
          })
        | null;
      if (existing) {
        const version = versionFromRow(existing);
        const head = await this.getThreadHead(version.threadId);
        if (!head) {
          throw new ChatNotFoundError("thread_head", version.threadId);
        }
        return {
          ok: true,
          post: postFromVersion(version, existing.post_index, existing.deleted_at_ms),
          head,
        };
      }
    }

    return this.db.transaction(() => {
      const parentRow = this.db
        .prepare("SELECT * FROM chat_post_versions WHERE id = ?")
        .get(input.parentVersionId) as Parameters<typeof versionFromRow>[0] | null;
      if (!parentRow) {
        throw new ChatNotFoundError("post_version", input.parentVersionId);
      }
      const parentVersion = versionFromRow(parentRow);

      const thread = this.db
        .prepare("SELECT * FROM chat_threads WHERE id = ?")
        .get(parentVersion.threadId) as { id: string; default_head_id: string | null } | null;
      if (!thread) throw new ChatNotFoundError("thread", parentVersion.threadId);

      const currentHead = thread.default_head_id
        ? (this.db
            .prepare("SELECT * FROM chat_thread_heads WHERE id = ?")
            .get(thread.default_head_id) as {
            id: string;
            thread_id: string;
            name: string;
            head_post_version_id: string;
            created_at_ms: number;
          } | null)
        : null;

      if (
        input.expectedHeadPostVersionId !== undefined &&
        (currentHead?.head_post_version_id ?? null) !== (input.expectedHeadPostVersionId ?? null)
      ) {
        if (!currentHead) {
          throw new ChatConflictError("head_conflict", "expected head but thread is empty");
        }
        return {
          ok: false as const,
          reason: "head_conflict" as const,
          currentHead: {
            id: currentHead.id,
            threadId: currentHead.thread_id,
            name: currentHead.name,
            headPostVersionId: currentHead.head_post_version_id,
            createdAtMs: currentHead.created_at_ms,
          },
        };
      }

      const previousInChain = parentVersion.previousPostVersionId
        ? versionFromRow(
            this.db
              .prepare("SELECT * FROM chat_post_versions WHERE id = ?")
              .get(parentVersion.previousPostVersionId) as Parameters<typeof versionFromRow>[0],
          )
        : null;

      const prepared = prepareEditPost({
        ...input,
        threadId: parentVersion.threadId,
        previousPostVersionId: parentVersion.previousPostVersionId ?? null,
        previousLineageHash: previousInChain?.lineageHash ?? null,
      });

      const postRow = this.db
        .prepare("SELECT post_index, deleted_at_ms FROM chat_posts WHERE id = ?")
        .get(input.postId) as { post_index: number; deleted_at_ms: number | null } | null;
      if (!postRow) throw new ChatNotFoundError("post", input.postId);

      this.db
        .prepare(
          `INSERT INTO chat_post_versions
           (id, post_id, thread_id, parent_version_id, previous_post_version_id,
            author_scope_type, author_scope_id, message, mentions, model, usage, content_hash, lineage_hash,
            signature, idempotency_key, created_at_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          prepared.versionId,
          prepared.postId,
          prepared.threadId,
          prepared.parentVersionId,
          prepared.previousPostVersionId,
          prepared.author.type,
          prepared.author.id,
          JSON.stringify(prepared.message),
          prepared.mentions ? JSON.stringify(prepared.mentions) : null,
          prepared.model ? JSON.stringify(prepared.model) : null,
          prepared.usage ? JSON.stringify(prepared.usage) : null,
          prepared.contentHash,
          prepared.lineageHash,
          null,
          input.idempotencyKey ?? null,
          prepared.createdAtMs,
        );

      let head: ThreadHead;
      if (currentHead?.head_post_version_id === input.parentVersionId) {
        this.db
          .prepare("UPDATE chat_thread_heads SET head_post_version_id = ? WHERE id = ?")
          .run(prepared.versionId, currentHead.id);
        head = {
          id: currentHead.id,
          threadId: currentHead.thread_id,
          name: currentHead.name,
          headPostVersionId: prepared.versionId,
          createdAtMs: currentHead.created_at_ms,
        };
      } else if (currentHead) {
        head = {
          id: currentHead.id,
          threadId: currentHead.thread_id,
          name: currentHead.name,
          headPostVersionId: currentHead.head_post_version_id,
          createdAtMs: currentHead.created_at_ms,
        };
      } else {
        head = {
          id: createId(),
          threadId: parentVersion.threadId,
          name: DEFAULT_HEAD_NAME,
          headPostVersionId: prepared.versionId,
          createdAtMs: prepared.createdAtMs,
        };
        this.db
          .prepare(
            `INSERT INTO chat_thread_heads
             (id, thread_id, name, head_post_version_id, created_at_ms)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run(head.id, head.threadId, head.name, head.headPostVersionId, head.createdAtMs);
        this.db
          .prepare("UPDATE chat_threads SET default_head_id = ? WHERE id = ?")
          .run(head.id, parentVersion.threadId);
      }

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

      return {
        ok: true as const,
        post: postFromVersion(version, postRow.post_index, postRow.deleted_at_ms),
        head,
      };
    })();
  }

  async deletePost(input: DeletePostInput): Promise<Post> {
    const post = await this.requirePost(input.postId);
    const deletedAtMs = input.deletedAtMs ?? Date.now();
    this.db
      .prepare("UPDATE chat_posts SET deleted_at_ms = ? WHERE id = ?")
      .run(deletedAtMs, input.postId);
    return { ...post, deletedAtMs };
  }

  async addChannelMember(input: AddChannelMemberInput): Promise<ChatAclEvent> {
    await this.requireChannel(input.channelId);
    const createdAtMs = Date.now();
    this.db
      .prepare(
        `INSERT OR REPLACE INTO chat_channel_members
         (channel_id, scope_type, scope_id, role, created_at_ms)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(input.channelId, input.scope.type, input.scope.id, input.role, createdAtMs);

    const previousAclEventId = this.latestAclEventId();
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
      createdAtMs,
    };
    this.insertAclEvent(event, input.scope, input.role);
    return event;
  }

  async removeChannelMember(input: RemoveChannelMemberInput): Promise<ChatAclEvent> {
    await this.requireChannel(input.channelId);
    this.db
      .prepare(
        "DELETE FROM chat_channel_members WHERE channel_id = ? AND scope_type = ? AND scope_id = ?",
      )
      .run(input.channelId, input.scope.type, input.scope.id);

    const previousAclEventId = this.latestAclEventId();
    const createdAtMs = Date.now();
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
      createdAtMs,
    };
    this.insertAclEvent(event, input.scope);
    return event;
  }

  async addThreadParticipant(input: AddThreadParticipantInput): Promise<ChatAclEvent> {
    await this.requireThread(input.threadId);
    const createdAtMs = Date.now();
    this.db
      .prepare(
        `INSERT OR REPLACE INTO chat_thread_participants
         (thread_id, scope_type, scope_id, role, created_at_ms)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(input.threadId, input.scope.type, input.scope.id, input.role, createdAtMs);

    const previousAclEventId = this.latestAclEventId();
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
      createdAtMs,
    };
    this.insertAclEvent(event, input.scope, input.role, input.threadId);
    return event;
  }

  async removeThreadParticipant(input: RemoveThreadParticipantInput): Promise<ChatAclEvent> {
    await this.requireThread(input.threadId);
    this.db
      .prepare(
        "DELETE FROM chat_thread_participants WHERE thread_id = ? AND scope_type = ? AND scope_id = ?",
      )
      .run(input.threadId, input.scope.type, input.scope.id);

    const previousAclEventId = this.latestAclEventId();
    const createdAtMs = Date.now();
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
      createdAtMs,
    };
    this.insertAclEvent(event, input.scope, undefined, input.threadId);
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
    this.db
      .prepare(
        `INSERT INTO chat_thread_heads
         (id, thread_id, name, head_post_version_id, created_at_ms)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(head.id, head.threadId, head.name, head.headPostVersionId, head.createdAtMs);
    return head;
  }

  async listChannelMembers(channelId: string): Promise<ScopeRef[]> {
    const rows = this.db
      .prepare("SELECT scope_type, scope_id FROM chat_channel_members WHERE channel_id = ?")
      .all(channelId) as ScopeRow[];
    return rows.map(scopeFromRow);
  }

  async listThreadParticipants(threadId: string): Promise<ScopeRef[]> {
    const rows = this.db
      .prepare("SELECT scope_type, scope_id FROM chat_thread_participants WHERE thread_id = ?")
      .all(threadId) as ScopeRow[];
    return rows.map(scopeFromRow);
  }

  async listAclEvents(input: {
    channelId?: string;
    threadId?: string;
    limit?: number;
  }): Promise<ChatAclEvent[]> {
    let query = "SELECT * FROM chat_acl_events";
    const params: string[] = [];
    if (input.channelId) {
      query += " WHERE target_type = 'channel' AND target_id = ?";
      params.push(input.channelId);
    } else if (input.threadId) {
      query += " WHERE target_type = 'thread' AND target_id = ?";
      params.push(input.threadId);
    }
    query += " ORDER BY created_at_ms ASC";
    const rows = this.db.prepare(query).all(...params) as AclEventRow[];
    const events = rows.map(aclEventFromRow);

    return events.slice(0, input.limit ?? events.length);
  }

  private latestAclEventId(): string | null {
    const row = this.db
      .prepare("SELECT id FROM chat_acl_events ORDER BY created_at_ms DESC LIMIT 1")
      .get() as { id: string } | null;
    return row?.id ?? null;
  }

  private insertAclEvent(
    event: ChatAclEvent,
    subject?: ScopeRef,
    role?: string,
    threadTargetId?: string,
  ): void {
    const targetType = event.type.startsWith("channel.") ? "channel" : "thread";
    const targetId =
      targetType === "channel"
        ? (event as Extract<ChatAclEvent, { channelId: string }>).channelId
        : (threadTargetId ?? (event as Extract<ChatAclEvent, { threadId: string }>).threadId);

    this.db
      .prepare(
        `INSERT INTO chat_acl_events
         (id, target_type, target_id, event_type, actor_scope_type, actor_scope_id,
          subject_scope_type, subject_scope_id, role, previous_acl_event_id, content_hash, signature, created_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.id,
        targetType,
        targetId,
        event.type,
        event.actor.type,
        event.actor.id,
        subject?.type ?? null,
        subject?.id ?? null,
        role ?? ("role" in event ? event.role : null),
        event.previousAclEventId ?? null,
        event.contentHash,
        event.signature ? JSON.stringify(event.signature) : null,
        event.createdAtMs,
      );
  }

  async listPostStreamEvents(postId: string) {
    return sqliteListPostStreamEvents(this.db, postId);
  }

  async startStreamedPost(input: import("@khoralabs/chat-core").StartStreamedPostInput) {
    return sqliteStartStreamedPost(this.db, input, (versionId) =>
      this.getPostVersionSync(versionId),
    );
  }

  async applyPostDelta(input: import("@khoralabs/chat-core").ApplyPostDeltaInput) {
    return sqliteApplyPostDelta(this.db, input, (versionId) => this.getPostVersionSync(versionId));
  }

  async completeStreamedPost(input: import("@khoralabs/chat-core").CompleteStreamedPostInput) {
    return sqliteCompleteStreamedPost(this.db, input);
  }

  async abortStreamedPost(input: import("@khoralabs/chat-core").AbortStreamedPostInput) {
    return sqliteAbortStreamedPost(this.db, input, (versionId) =>
      this.getPostVersionSync(versionId),
    );
  }

  async rebuildStreamedPostCache(postId: string) {
    return sqliteRebuildStreamedPostCache(this.db, postId, (versionId) =>
      this.getPostVersionSync(versionId),
    );
  }
}

export function createSqliteChatPersistence(db: Database): SqliteChatPersistence {
  return new SqliteChatPersistence(db);
}
