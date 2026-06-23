import type { UIMessage } from "ai";
import type {
  JsonObject,
  Mention,
  PostModelMetadata,
  PostStreamEvent,
  PostUsage,
  StreamingPost,
} from "./types.ts";

export function rebuildStreamCacheFromEvents(events: PostStreamEvent[]): {
  message: UIMessage;
  mentions?: Mention[];
  model?: PostModelMetadata;
  usage?: PostUsage;
  revision: number;
} {
  const sorted = [...events].sort((a, b) => a.revision - b.revision);
  let message: UIMessage | null = null;
  let mentions: Mention[] | undefined;
  let model: PostModelMetadata | undefined;
  let usage: PostUsage | undefined;
  let revision = 0;

  for (const event of sorted) {
    if (event.eventType === "stream.started") {
      if (!event.message) {
        throw new Error(`stream.started event ${event.id} missing message`);
      }
      message = event.message;
      mentions = event.mentions;
      model = event.model;
      usage = event.usage;
      revision = event.revision;
      continue;
    }
    if (event.eventType === "stream.delta") {
      if (!event.message) {
        throw new Error(`stream.delta event ${event.id} missing message`);
      }
      message = event.message;
      if (event.mentions !== undefined) mentions = event.mentions;
      if (event.model !== undefined) model = event.model;
      if (event.usage !== undefined) usage = event.usage;
      revision = event.revision;
      continue;
    }
    if (event.eventType === "stream.completed" || event.eventType === "stream.aborted") {
      revision = event.revision;
    }
  }

  if (!message) {
    throw new Error("stream events did not produce a message");
  }

  return { message, mentions, model, usage, revision };
}

export function streamingPostFromCache(input: {
  postId: string;
  threadId: string;
  author: { type: string; id: string };
  message: UIMessage;
  mentions?: Mention[];
  model?: PostModelMetadata;
  usage?: PostUsage;
  index: number;
  streamRevision: number;
  createdAtMs: number;
  updatedAtMs?: number | null;
  deletedAtMs?: number | null;
}): StreamingPost {
  return {
    ...input.message,
    id: input.postId,
    status: "streaming",
    threadId: input.threadId,
    author: input.author,
    mentions: input.mentions,
    model: input.model,
    usage: input.usage,
    index: input.index,
    streamRevision: input.streamRevision,
    createdAtMs: input.createdAtMs,
    updatedAtMs: input.updatedAtMs ?? null,
    deletedAtMs: input.deletedAtMs ?? null,
  };
}

export function mergeThreadPostsForList(
  lineagePosts: Array<{ index: number; post: import("./types.ts").CommittedPost }>,
  activePosts: Array<import("./types.ts").StreamingPost | import("./types.ts").AbortedPost>,
): Array<import("./types.ts").Post> {
  const byIndex = new Map<number, import("./types.ts").Post>();
  for (const item of lineagePosts) {
    byIndex.set(item.index, item.post);
  }
  for (const post of activePosts) {
    if (post.status === "streaming" || post.status === "aborted") {
      byIndex.set(post.index, post);
    }
  }
  return [...byIndex.entries()].sort(([a], [b]) => a - b).map(([, post]) => post);
}

export type StreamDeltaMetadata = JsonObject;
