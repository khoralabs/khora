import type { Channel, Post, ScopeRef, Thread, ThreadHead } from "./types.ts";

export type PostAppended = {
  type: "post.appended";
  threadId: string;
  post: Post;
};

export type PostUpdated = {
  type: "post.updated";
  threadId: string;
  post: Post;
};

export type PostDeleted = {
  type: "post.deleted";
  threadId: string;
  postId: string;
  deletedAtMs: number;
};

export type PostStreamStarted = {
  type: "post.stream.started";
  threadId: string;
  post: Post;
  revision: number;
};

export type PostStreamDelta = {
  type: "post.stream.delta";
  threadId: string;
  post: Post;
  revision: number;
};

export type PostStreamCompleted = {
  type: "post.stream.completed";
  threadId: string;
  post: Post;
  head: ThreadHead;
  revision: number;
};

export type PostStreamAborted = {
  type: "post.stream.aborted";
  threadId: string;
  postId: string;
  revision: number;
  deletedAtMs: number;
};

export type ThreadCreated = {
  type: "thread.created";
  thread: Thread;
};

export type ParticipantAdded = {
  type: "participant.added";
  threadId: string;
  scope: ScopeRef;
  role: string;
};

export type ChannelCreated = {
  type: "channel.created";
  channel: Channel;
};

export type ChatEvent =
  | PostAppended
  | PostUpdated
  | PostDeleted
  | PostStreamStarted
  | PostStreamDelta
  | PostStreamCompleted
  | PostStreamAborted
  | ThreadCreated
  | ParticipantAdded
  | ChannelCreated;
