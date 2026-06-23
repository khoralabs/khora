import type { Channel, Post, ScopeRef, Thread } from "./types.ts";

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
  | ThreadCreated
  | ParticipantAdded
  | ChannelCreated;
