import type { UIMessage } from "ai";

export type JsonObject = Record<string, unknown>;

export type ScopeRef = {
  type: string;
  id: string;
};

export type Scope = ScopeRef & {
  did?: string;
  displayName?: string;
  metadata?: JsonObject;
};

export type SignedEnvelope = {
  algorithm: string;
  signer: ScopeRef;
  keyId?: string;
  signature: string;
  signedAtMs: number;
};

export type ChatSigner = {
  sign(payload: Uint8Array, signer: ScopeRef): Promise<SignedEnvelope>;
};

export type ChatVerifier = {
  verify(payload: Uint8Array, envelope: SignedEnvelope): Promise<boolean>;
};

export type Mention = {
  scope: ScopeRef;
  label: string;
  partIndex?: number;
  startOffset?: number;
  endOffset?: number;
};

export type Channel = {
  id: string;
  metadata?: JsonObject;
  createdAtMs: number;
};

export type ThreadRoot =
  | { type: "channel"; channelId: string }
  | { type: "post"; postId: string; versionId?: string };

export type Thread = {
  id: string;
  root: ThreadRoot;
  defaultHeadId?: string | null;
  metadata?: JsonObject;
  createdAtMs: number;
  archivedAtMs?: number | null;
};

export type ThreadHead = {
  id: string;
  threadId: string;
  name: string;
  headPostVersionId: string;
  createdAtMs: number;
};

export type PostVersion = Omit<UIMessage, "id"> & {
  id: string;
  postId: string;
  threadId: string;
  parentVersionId?: string | null;
  previousPostVersionId?: string | null;
  author: ScopeRef;
  contentHash: string;
  lineageHash: string;
  signature?: SignedEnvelope;
  mentions?: Mention[];
  createdAtMs: number;
};

export type Post = UIMessage & {
  threadId: string;
  author: ScopeRef;
  versionId: string;
  previousVersionId?: string | null;
  previousPostVersionId?: string | null;
  contentHash: string;
  lineageHash: string;
  signature?: SignedEnvelope;
  mentions?: Mention[];
  index: number;
  createdAtMs: number;
  updatedAtMs?: number | null;
  deletedAtMs?: number | null;
};

export type ChannelMember = {
  channelId: string;
  scope: ScopeRef;
  role: string;
  createdAtMs: number;
};

export type ThreadParticipant = {
  threadId: string;
  scope: ScopeRef;
  role: string;
  createdAtMs: number;
};

export type ChatAclEvent =
  | {
      id: string;
      type: "channel.member.added";
      channelId: string;
      scope: ScopeRef;
      role: string;
      actor: ScopeRef;
      previousAclEventId?: string | null;
      contentHash: string;
      signature?: SignedEnvelope;
      createdAtMs: number;
    }
  | {
      id: string;
      type: "channel.member.removed";
      channelId: string;
      scope: ScopeRef;
      actor: ScopeRef;
      previousAclEventId?: string | null;
      contentHash: string;
      signature?: SignedEnvelope;
      createdAtMs: number;
    }
  | {
      id: string;
      type: "thread.participant.added";
      threadId: string;
      scope: ScopeRef;
      role: string;
      actor: ScopeRef;
      previousAclEventId?: string | null;
      contentHash: string;
      signature?: SignedEnvelope;
      createdAtMs: number;
    }
  | {
      id: string;
      type: "thread.participant.removed";
      threadId: string;
      scope: ScopeRef;
      actor: ScopeRef;
      previousAclEventId?: string | null;
      contentHash: string;
      signature?: SignedEnvelope;
      createdAtMs: number;
    };

export type ThreadPage = {
  items: Thread[];
  nextCursor?: string | null;
};

export type PostPage = {
  items: Post[];
  nextCursor?: string | null;
};
