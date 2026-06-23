import type { Database } from "bun:sqlite";
import type {
  AbortStreamedPostInput,
  AbortStreamedPostResult,
  ApplyPostDeltaInput,
  ApplyPostDeltaResult,
  CompleteStreamedPostInput,
  CompleteStreamedPostResult,
  Mention,
  Post,
  PostModelMetadata,
  PostStatus,
  PostStreamEvent,
  PostUsage,
  PostVersion,
  ScopeRef,
  StartStreamedPostInput,
  StartStreamedPostResult,
  ThreadHead,
} from "@khoralabs/chat-core";
import {
  ChatConflictError,
  ChatNotFoundError,
  ChatValidationError,
  createId,
  postFromVersion,
  rebuildStreamCacheFromEvents,
  streamingPostFromCache,
} from "@khoralabs/chat-core";
import { prepareAppendPost } from "@khoralabs/chat-persistence";
import type { UIMessage } from "ai";

const DEFAULT_HEAD_NAME = "default";

export type PostRow = {
  id: string;
  thread_id: string;
  post_index: number;
  status: PostStatus;
  stream_message: string | null;
  stream_mentions: string | null;
  stream_model: string | null;
  stream_usage: string | null;
  stream_author_scope_type: string | null;
  stream_author_scope_id: string | null;
  stream_revision: number;
  completed_version_id: string | null;
  created_at_ms: number;
  updated_at_ms: number | null;
  deleted_at_ms: number | null;
};

function parseJson<T>(value: string | null): T | undefined {
  if (!value) return undefined;
  return JSON.parse(value) as T;
}

function scopeFromRow(type: string, id: string): ScopeRef {
  return { type, id };
}

function requireStreamAuthor(row: PostRow): ScopeRef {
  if (!row.stream_author_scope_type || !row.stream_author_scope_id) {
    throw new ChatValidationError(`post ${row.id} is missing stream author`);
  }
  return scopeFromRow(row.stream_author_scope_type, row.stream_author_scope_id);
}

export function postFromRow(
  row: PostRow,
  getVersion: (versionId: string) => PostVersion | null,
): Post | null {
  if (row.status === "streaming") {
    const message = parseJson<UIMessage>(row.stream_message);
    if (!message || !row.stream_author_scope_type || !row.stream_author_scope_id) return null;
    return streamingPostFromCache({
      postId: row.id,
      threadId: row.thread_id,
      author: scopeFromRow(row.stream_author_scope_type, row.stream_author_scope_id),
      message,
      mentions: parseJson(row.stream_mentions),
      model: parseJson(row.stream_model),
      usage: parseJson(row.stream_usage),
      index: row.post_index,
      streamRevision: row.stream_revision,
      createdAtMs: row.created_at_ms,
      updatedAtMs: row.updated_at_ms,
      deletedAtMs: row.deleted_at_ms,
    });
  }
  if (row.status === "aborted") {
    const message = parseJson<UIMessage>(row.stream_message);
    if (!message || !row.stream_author_scope_type || !row.stream_author_scope_id) return null;
    return {
      ...message,
      id: row.id,
      status: "aborted",
      threadId: row.thread_id,
      author: scopeFromRow(row.stream_author_scope_type, row.stream_author_scope_id),
      mentions: parseJson(row.stream_mentions),
      model: parseJson(row.stream_model),
      usage: parseJson(row.stream_usage),
      index: row.post_index,
      streamRevision: row.stream_revision,
      createdAtMs: row.created_at_ms,
      updatedAtMs: row.updated_at_ms,
      deletedAtMs: row.deleted_at_ms,
    };
  }
  const versionId = row.completed_version_id;
  if (!versionId) return null;
  const version = getVersion(versionId);
  if (!version) return null;
  return postFromVersion(version, row.post_index, row.deleted_at_ms);
}

function getPostRow(db: Database, postId: string): PostRow | null {
  return db
    .prepare(
      `SELECT id, thread_id, post_index, status, stream_message, stream_mentions, stream_model, stream_usage,
              stream_author_scope_type, stream_author_scope_id, stream_revision,
              completed_version_id, created_at_ms, updated_at_ms, deleted_at_ms
       FROM chat_posts WHERE id = ?`,
    )
    .get(postId) as PostRow | null;
}

function insertStreamEvent(
  db: Database,
  event: Omit<PostStreamEvent, "createdAtMs"> & { createdAtMs: number },
): void {
  db.prepare(
    `INSERT INTO chat_post_stream_events
     (id, post_id, thread_id, event_type, revision, message, delta, mentions, model, usage, idempotency_key, created_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    event.id,
    event.postId,
    event.threadId,
    event.eventType,
    event.revision,
    event.message ? JSON.stringify(event.message) : null,
    event.delta ? JSON.stringify(event.delta) : null,
    event.mentions ? JSON.stringify(event.mentions) : null,
    event.model ? JSON.stringify(event.model) : null,
    event.usage ? JSON.stringify(event.usage) : null,
    event.idempotencyKey ?? null,
    event.createdAtMs,
  );
}

function getStreamIdempotency(
  db: Database,
  key: string,
): { post_id: string; revision: number } | null {
  return db
    .prepare(
      `SELECT post_id, revision FROM chat_post_stream_events
       WHERE idempotency_key = ?`,
    )
    .get(key) as { post_id: string; revision: number } | null;
}

export function sqliteListPostStreamEvents(db: Database, postId: string): PostStreamEvent[] {
  const rows = db
    .prepare(
      `SELECT id, post_id, thread_id, event_type, revision, message, delta, mentions, model, usage, idempotency_key, created_at_ms
       FROM chat_post_stream_events WHERE post_id = ? ORDER BY revision ASC`,
    )
    .all(postId) as Array<{
    id: string;
    post_id: string;
    thread_id: string;
    event_type: PostStreamEvent["eventType"];
    revision: number;
    message: string | null;
    delta: string | null;
    mentions: string | null;
    model: string | null;
    usage: string | null;
    idempotency_key: string | null;
    created_at_ms: number;
  }>;
  return rows.map((row) => ({
    id: row.id,
    postId: row.post_id,
    threadId: row.thread_id,
    eventType: row.event_type,
    revision: row.revision,
    message: parseJson(row.message),
    delta: parseJson(row.delta),
    mentions: parseJson(row.mentions),
    model: parseJson(row.model),
    usage: parseJson(row.usage),
    idempotencyKey: row.idempotency_key ?? undefined,
    createdAtMs: row.created_at_ms,
  }));
}

export function sqliteStartStreamedPost(
  db: Database,
  input: StartStreamedPostInput,
  getVersion: (versionId: string) => PostVersion | null,
): StartStreamedPostResult {
  if (input.idempotencyKey) {
    const existing = getStreamIdempotency(db, input.idempotencyKey);
    if (existing) {
      const row = getPostRow(db, existing.post_id);
      if (!row) throw new ChatNotFoundError("post", existing.post_id);
      const post = postFromRow(row, getVersion);
      if (post?.status !== "streaming") {
        throw new ChatConflictError("idempotency_mismatch", "idempotency key reused");
      }
      return { post, revision: existing.revision };
    }
  }

  return db.transaction(() => {
    const thread = db.prepare("SELECT id FROM chat_threads WHERE id = ?").get(input.threadId) as {
      id: string;
    } | null;
    if (!thread) throw new ChatNotFoundError("thread", input.threadId);

    const maxIndexRow = db
      .prepare(
        "SELECT COALESCE(MAX(post_index), 0) AS max_index FROM chat_posts WHERE thread_id = ?",
      )
      .get(input.threadId) as { max_index: number };
    const nextIndex = maxIndexRow.max_index + 1;
    const postId = input.message.id || createId();
    const createdAtMs = Date.now();
    const message: UIMessage = { ...input.message, id: postId };
    const revision = 1;

    db.prepare(
      `INSERT INTO chat_posts
       (id, thread_id, post_index, status, stream_message, stream_mentions, stream_model, stream_usage,
        stream_author_scope_type, stream_author_scope_id, stream_revision,
        completed_version_id, created_at_ms, updated_at_ms, deleted_at_ms)
       VALUES (?, ?, ?, 'streaming', ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, NULL)`,
    ).run(
      postId,
      input.threadId,
      nextIndex,
      JSON.stringify(message),
      input.mentions ? JSON.stringify(input.mentions) : null,
      input.model ? JSON.stringify(input.model) : null,
      input.usage ? JSON.stringify(input.usage) : null,
      input.author.type,
      input.author.id,
      revision,
      createdAtMs,
    );

    insertStreamEvent(db, {
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
    });

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
  })();
}

export function sqliteApplyPostDelta(
  db: Database,
  input: ApplyPostDeltaInput,
  getVersion: (versionId: string) => PostVersion | null,
): ApplyPostDeltaResult {
  if (input.idempotencyKey) {
    const existing = getStreamIdempotency(db, input.idempotencyKey);
    if (existing && existing.post_id === input.postId) {
      const row = getPostRow(db, input.postId);
      if (!row) throw new ChatNotFoundError("post", input.postId);
      const post = postFromRow(row, getVersion);
      if (post?.status !== "streaming") {
        throw new ChatConflictError("idempotency_mismatch", "idempotency key reused");
      }
      return { post, revision: existing.revision };
    }
  }

  return db.transaction(() => {
    const row = getPostRow(db, input.postId);
    if (!row) throw new ChatNotFoundError("post", input.postId);
    if (row.status !== "streaming") {
      throw new ChatValidationError(`post ${input.postId} is not streaming`);
    }
    if (input.expectedRevision !== undefined && row.stream_revision !== input.expectedRevision) {
      throw new ChatConflictError(
        "stream_revision_conflict",
        `expected revision ${input.expectedRevision}, current ${row.stream_revision}`,
      );
    }

    const revision = row.stream_revision + 1;
    const updatedAtMs = Date.now();
    const message: UIMessage = { ...input.message, id: input.postId };
    const mentions = input.mentions ?? parseJson<Mention[]>(row.stream_mentions);
    const model = input.model ?? parseJson<PostModelMetadata>(row.stream_model);
    const usage = input.usage ?? parseJson<PostUsage>(row.stream_usage);

    db.prepare(
      `UPDATE chat_posts
       SET stream_message = ?, stream_mentions = ?, stream_model = ?, stream_usage = ?, stream_revision = ?, updated_at_ms = ?
       WHERE id = ?`,
    ).run(
      JSON.stringify(message),
      mentions ? JSON.stringify(mentions) : null,
      model ? JSON.stringify(model) : null,
      usage ? JSON.stringify(usage) : null,
      revision,
      updatedAtMs,
      input.postId,
    );

    insertStreamEvent(db, {
      id: createId(),
      postId: input.postId,
      threadId: row.thread_id,
      eventType: "stream.delta",
      revision,
      message,
      delta: input.delta,
      mentions,
      model,
      usage,
      idempotencyKey: input.idempotencyKey,
      createdAtMs: updatedAtMs,
    });

    const post = streamingPostFromCache({
      postId: input.postId,
      threadId: row.thread_id,
      author: requireStreamAuthor(row),
      message,
      mentions,
      model,
      usage,
      index: row.post_index,
      streamRevision: revision,
      createdAtMs: row.created_at_ms,
      updatedAtMs,
      deletedAtMs: row.deleted_at_ms,
    });
    return { post, revision };
  })();
}

export function sqliteCompleteStreamedPost(
  db: Database,
  input: CompleteStreamedPostInput,
): CompleteStreamedPostResult {
  return db.transaction(() => {
    const row = getPostRow(db, input.postId);
    if (!row) throw new ChatNotFoundError("post", input.postId);
    if (row.status !== "streaming") {
      throw new ChatValidationError(`post ${input.postId} is not streaming`);
    }
    if (input.expectedRevision !== undefined && row.stream_revision !== input.expectedRevision) {
      throw new ChatConflictError(
        "stream_revision_conflict",
        `expected revision ${input.expectedRevision}, current ${row.stream_revision}`,
      );
    }
    const message = parseJson<UIMessage>(row.stream_message);
    if (!message) throw new ChatValidationError(`post ${input.postId} has no streamed message`);
    const model = parseJson<PostModelMetadata>(row.stream_model);
    const usage = parseJson<PostUsage>(row.stream_usage);

    const thread = db
      .prepare("SELECT id, default_head_id FROM chat_threads WHERE id = ?")
      .get(row.thread_id) as { id: string; default_head_id: string | null } | null;
    if (!thread) throw new ChatNotFoundError("thread", row.thread_id);

    const currentHead = thread.default_head_id
      ? (db.prepare("SELECT * FROM chat_thread_heads WHERE id = ?").get(thread.default_head_id) as {
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
      if (!currentHead)
        throw new ChatConflictError("head_conflict", "expected head but thread is empty");
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
      ? (db
          .prepare("SELECT * FROM chat_post_versions WHERE id = ?")
          .get(currentHead.head_post_version_id) as {
          id: string;
          lineage_hash: string;
        } | null)
      : null;

    const prepared = prepareAppendPost({
      threadId: row.thread_id,
      author: requireStreamAuthor(row),
      message,
      mentions: parseJson(row.stream_mentions),
      model,
      usage,
      previousPostVersionId: previousVersion?.id ?? null,
      previousLineageHash: previousVersion?.lineage_hash ?? null,
    });

    db.prepare(
      `INSERT INTO chat_post_versions
       (id, post_id, thread_id, parent_version_id, previous_post_version_id,
        author_scope_type, author_scope_id, message, mentions, model, usage, content_hash, lineage_hash,
        signature, idempotency_key, created_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
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
          threadId: row.thread_id,
          name: currentHead.name,
          headPostVersionId: prepared.versionId,
          createdAtMs: currentHead.created_at_ms,
        }
      : {
          id: createId(),
          threadId: row.thread_id,
          name: DEFAULT_HEAD_NAME,
          headPostVersionId: prepared.versionId,
          createdAtMs: prepared.createdAtMs,
        };

    if (currentHead) {
      db.prepare("UPDATE chat_thread_heads SET head_post_version_id = ? WHERE id = ?").run(
        prepared.versionId,
        head.id,
      );
    } else {
      db.prepare(
        `INSERT INTO chat_thread_heads (id, thread_id, name, head_post_version_id, created_at_ms)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(head.id, head.threadId, head.name, head.headPostVersionId, head.createdAtMs);
      db.prepare("UPDATE chat_threads SET default_head_id = ? WHERE id = ?").run(
        head.id,
        row.thread_id,
      );
    }

    const completedRevision = row.stream_revision + 1;
    const completedAtMs = Date.now();
    insertStreamEvent(db, {
      id: createId(),
      postId: input.postId,
      threadId: row.thread_id,
      eventType: "stream.completed",
      revision: completedRevision,
      message,
      mentions: parseJson(row.stream_mentions),
      model,
      usage,
      createdAtMs: completedAtMs,
    });

    db.prepare(
      `UPDATE chat_posts
       SET status = 'complete', stream_message = NULL, stream_mentions = NULL,
           stream_model = NULL, stream_usage = NULL,
           stream_author_scope_type = NULL, stream_author_scope_id = NULL,
           stream_revision = ?, completed_version_id = ?, updated_at_ms = ?
       WHERE id = ?`,
    ).run(completedRevision, prepared.versionId, completedAtMs, input.postId);

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

    return {
      ok: true as const,
      post: postFromVersion(version, row.post_index, row.deleted_at_ms),
      head,
    };
  })();
}

export function sqliteAbortStreamedPost(
  db: Database,
  input: AbortStreamedPostInput,
  getVersion: (versionId: string) => PostVersion | null,
): AbortStreamedPostResult {
  return db.transaction(() => {
    const row = getPostRow(db, input.postId);
    if (!row) throw new ChatNotFoundError("post", input.postId);
    if (row.status !== "streaming") {
      throw new ChatValidationError(`post ${input.postId} is not streaming`);
    }
    const deletedAtMs = input.deletedAtMs ?? Date.now();
    const revision = row.stream_revision + 1;
    insertStreamEvent(db, {
      id: createId(),
      postId: input.postId,
      threadId: row.thread_id,
      eventType: "stream.aborted",
      revision,
      message: parseJson(row.stream_message),
      mentions: parseJson(row.stream_mentions),
      model: parseJson(row.stream_model),
      usage: parseJson(row.stream_usage),
      createdAtMs: deletedAtMs,
    });
    db.prepare(
      `UPDATE chat_posts SET status = 'aborted', stream_revision = ?, deleted_at_ms = ?, updated_at_ms = ? WHERE id = ?`,
    ).run(revision, deletedAtMs, deletedAtMs, input.postId);
    const updated = getPostRow(db, input.postId);
    if (!updated) throw new ChatNotFoundError("post", input.postId);
    const post = postFromRow(updated, getVersion);
    if (post?.status !== "aborted") throw new ChatNotFoundError("post", input.postId);
    return { post };
  })();
}

export function sqliteRebuildStreamedPostCache(
  db: Database,
  postId: string,
  _getVersion: (versionId: string) => PostVersion | null,
) {
  const row = getPostRow(db, postId);
  if (!row) throw new ChatNotFoundError("post", postId);
  if (row.status !== "streaming") {
    throw new ChatValidationError(`post ${postId} is not streaming`);
  }
  const events = sqliteListPostStreamEvents(db, postId);
  const rebuilt = rebuildStreamCacheFromEvents(events);
  const updatedAtMs = Date.now();
  db.prepare(
    `UPDATE chat_posts SET stream_message = ?, stream_mentions = ?, stream_model = ?, stream_usage = ?, stream_revision = ?, updated_at_ms = ? WHERE id = ?`,
  ).run(
    JSON.stringify(rebuilt.message),
    rebuilt.mentions ? JSON.stringify(rebuilt.mentions) : null,
    rebuilt.model ? JSON.stringify(rebuilt.model) : null,
    rebuilt.usage ? JSON.stringify(rebuilt.usage) : null,
    rebuilt.revision,
    updatedAtMs,
    postId,
  );
  return streamingPostFromCache({
    postId,
    threadId: row.thread_id,
    author: requireStreamAuthor(row),
    message: rebuilt.message,
    mentions: rebuilt.mentions,
    model: rebuilt.model,
    usage: rebuilt.usage,
    index: row.post_index,
    streamRevision: rebuilt.revision,
    createdAtMs: row.created_at_ms,
    updatedAtMs,
    deletedAtMs: row.deleted_at_ms,
  });
}
