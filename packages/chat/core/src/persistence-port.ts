import type { UIMessage } from "ai";
import type {
  Channel,
  ChatAclEvent,
  JsonObject,
  Mention,
  Post,
  PostPage,
  PostVersion,
  ScopeRef,
  Thread,
  ThreadHead,
  ThreadPage,
  ThreadRoot,
} from "./types.ts";

export type CreateChannelInput = {
  id?: string;
  metadata?: JsonObject;
};

export type CreateThreadInput = {
  id?: string;
  root: ThreadRoot;
  metadata?: JsonObject;
};

export type AppendPostInput = {
  threadId: string;
  author: ScopeRef;
  message: UIMessage;
  mentions?: Mention[];
  expectedHeadPostVersionId?: string | null;
  idempotencyKey?: string;
};

export type EditPostInput = {
  postId: string;
  parentVersionId: string;
  author: ScopeRef;
  message: UIMessage;
  mentions?: Mention[];
  expectedHeadPostVersionId?: string | null;
  idempotencyKey?: string;
};

export type DeletePostInput = {
  postId: string;
  deletedAtMs?: number;
};

export type ListThreadsInput = {
  channelId?: string;
  postId?: string;
  cursor?: string;
  limit?: number;
};

export type ListPostsInput = {
  threadId: string;
  headId?: string;
  headPostVersionId?: string;
  cursor?: string;
  limit?: number;
};

export type AddChannelMemberInput = {
  channelId: string;
  scope: ScopeRef;
  role: string;
  actor: ScopeRef;
  signature?: ChatAclEvent["signature"];
};

export type RemoveChannelMemberInput = {
  channelId: string;
  scope: ScopeRef;
  actor: ScopeRef;
  signature?: ChatAclEvent["signature"];
};

export type AddThreadParticipantInput = {
  threadId: string;
  scope: ScopeRef;
  role: string;
  actor: ScopeRef;
  signature?: ChatAclEvent["signature"];
};

export type RemoveThreadParticipantInput = {
  threadId: string;
  scope: ScopeRef;
  actor: ScopeRef;
  signature?: ChatAclEvent["signature"];
};

export type AppendPostResult =
  | { ok: true; post: Post; head: ThreadHead }
  | { ok: false; reason: "head_conflict"; currentHead: ThreadHead };

export type EditPostResult =
  | { ok: true; post: Post; head: ThreadHead }
  | { ok: false; reason: "head_conflict"; currentHead: ThreadHead };

export type ChatReadPersistence = {
  getChannel(id: string): Promise<Channel | null>;
  getThread(id: string): Promise<Thread | null>;
  getPost(id: string): Promise<Post | null>;
  getPostVersion(id: string): Promise<PostVersion | null>;
  getThreadHead(threadId: string, headId?: string): Promise<ThreadHead | null>;
  listThreads(input: ListThreadsInput): Promise<ThreadPage>;
  listPosts(input: ListPostsInput): Promise<PostPage>;
  listChannelMembers(channelId: string): Promise<ScopeRef[]>;
  listThreadParticipants(threadId: string): Promise<ScopeRef[]>;
  listAclEvents(input: {
    channelId?: string;
    threadId?: string;
    limit?: number;
  }): Promise<ChatAclEvent[]>;
};

export type ChatWritePersistence = {
  createChannel(input: CreateChannelInput): Promise<Channel>;
  createThread(input: CreateThreadInput): Promise<Thread>;
  appendPost(input: AppendPostInput): Promise<AppendPostResult>;
  editPost(input: EditPostInput): Promise<EditPostResult>;
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
};

export type ChatPersistence = ChatReadPersistence & ChatWritePersistence;

export type PreparedAppendPost = {
  postId: string;
  versionId: string;
  threadId: string;
  author: ScopeRef;
  message: UIMessage;
  mentions?: Mention[];
  previousPostVersionId: string | null;
  previousLineageHash: string | null;
  parentVersionId?: string | null;
  createdAtMs: number;
  contentHash: string;
  lineageHash: string;
};

export type PreparedEditPost = PreparedAppendPost & {
  parentVersionId: string;
};
