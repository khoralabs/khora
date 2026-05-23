import type { AgentSigner } from "@khoralabs/atrium-auth";
import type {
  AtriumInviteListResponse,
  AtriumInvitePreviewResponse,
  AtriumPost,
  AtriumPostCreateContent,
  AtriumPostPatch,
  AtriumProfile,
  AtriumProfilePatch,
  AtriumRegistrationRequestBody,
  AtriumRegistrationResult,
  AtriumRelationshipItem,
  AtriumRelationshipListResponse,
  AtriumRoomCreateBody,
  AtriumRoomCreateResponse,
  AtriumRoomJoinRequestBody,
  AtriumRoomJoinTicketResponse,
  AtriumRoomMintTicketBody,
  AtriumRoomTicketResponse,
  AtriumSearchQuery,
  AtriumSearchRequest,
  AtriumSearchResponse,
} from "@khoralabs/atrium-contracts";
import {
  type AtriumClientEvent,
  type AtriumDuplexTransport,
  type AtriumFetch,
  type AtriumTransportBundle,
  type AtriumUnaryTransport,
  createAtriumTransportBundleFromEnv,
  type InboxWsHandlers,
} from "@khoralabs/atrium-transport";
import type { Checkpoint, SessionOp } from "@khoralabs/obp-v2-session-impl";
import {
  connectObpFrameChannelSession,
  type ObpFrameConnection,
  type ObpWebSocketConnectOptions,
} from "@khoralabs/obp-v2-transport-ws";
import {
  type AtriumPluginHandle,
  type AtriumPluginInstaller,
  createAtriumResolvePath,
} from "./atrium-plugins.ts";
import { getAgentStatus } from "./http/agent.ts";
import {
  type AuthorSubscriptionsSnapshot,
  listAuthorSubscriptions as httpListAuthorSubscriptions,
  subscribeAuthor as httpSubscribeAuthor,
  subscribeAuthorTopic as httpSubscribeAuthorTopic,
  unsubscribeAuthor as httpUnsubscribeAuthor,
  unsubscribeAuthorTopic as httpUnsubscribeAuthorTopic,
} from "./http/authors.ts";
import { health } from "./http/health.ts";
import { listInvites, previewInvite } from "./http/invites.ts";
import {
  type AtriumProbeCreateInput,
  createPost,
  deletePost,
  createProbe as httpCreateProbe,
  getPost as httpGetPost,
  updatePost,
} from "./http/posts.ts";
import {
  lookupProfileByDid as httpLookupProfileByDid,
  lookupProfileByUsername as httpLookupProfileByUsername,
  type PublicProfileResult,
  updateProfile,
} from "./http/profile.ts";
import { register } from "./http/register.ts";
import { listRelationships as httpListRelationships } from "./http/relationships.ts";
import {
  createRoom as httpCreateRoom,
  getRoom as httpGetRoom,
  leaveRoom as httpLeaveRoom,
  mintRoomTicket as httpMintRoomTicket,
  redeemRoomInvite as httpRedeemRoomInvite,
} from "./http/rooms.ts";
import { searchGet as httpSearchGet, searchPost as httpSearchPost } from "./http/search.ts";
import { subscribeTopic, unsubscribeTopic } from "./http/topics.ts";
import { unregister as httpUnregister, type UnregisterBody } from "./http/unregister.ts";

export type {
  AtriumRelationshipItem,
  AtriumRelationshipListResponse,
  AtriumRoomCreateBody,
  AtriumRoomCreateResponse,
  AtriumRoomJoinRequestBody,
  AtriumRoomJoinTicketResponse,
  AtriumRoomMintTicketBody,
  AtriumRoomTicketResponse,
} from "@khoralabs/atrium-contracts";
export type {
  ObpFrameConnection,
  ObpWebSocketConnectOptions,
} from "@khoralabs/obp-v2-transport-ws";
export type { AuthorSubscriptionsSnapshot } from "./http/authors.ts";
export type { PublicProfileResult } from "./http/profile.ts";

export type AtriumClientOptions = {
  /** Required unless {@link transportBundle} supplies unary+duplex. */
  baseUrl?: string;
  signer: AgentSigner;
  /** When set, {@link baseUrl} is optional — deploy-selected transports (`ATRIUM_TRANSPORT`, …). */
  transportBundle?: AtriumTransportBundle;
  fetch?: AtriumFetch;
  WebSocket?: typeof WebSocket;
  nowMs?: () => number;
  nonceFactory?: () => string;
  dataDir?: string;
  plugins?: readonly AtriumPluginInstaller[];
};

export class AtriumClient {
  private readonly transport: AtriumUnaryTransport;
  private readonly duplex: AtriumDuplexTransport;
  private readonly WebSocketCtor: typeof WebSocket;
  private readonly eventListeners: Array<(event: AtriumClientEvent) => void> = [];
  private readonly pluginHandles: AtriumPluginHandle[] = [];

  constructor(options: AtriumClientOptions) {
    let bundle: AtriumTransportBundle;
    if (options.transportBundle !== undefined) {
      bundle = options.transportBundle;
    } else {
      const bu = options.baseUrl?.trim() ?? "";
      if (bu === "") {
        throw new Error("AtriumClient: pass baseUrl or transportBundle");
      }
      bundle = createAtriumTransportBundleFromEnv({
        baseUrl: bu,
        signer: options.signer,
        fetch: options.fetch,
        nowMs: options.nowMs,
        nonceFactory: options.nonceFactory,
      });
    }
    this.transport = bundle.unary;
    this.duplex = bundle.duplex;
    this.WebSocketCtor = options.WebSocket ?? globalThis.WebSocket;
    const resolvePath = createAtriumResolvePath(options.dataDir);
    for (const installer of options.plugins ?? []) {
      this.pluginHandles.push(installer({ client: this, resolvePath }));
    }
  }

  get did(): string {
    return this.transport.did;
  }

  dispose(): void {
    for (let i = this.pluginHandles.length - 1; i >= 0; i--) {
      const h = this.pluginHandles[i];
      if (h !== undefined) h.stop();
    }
    this.pluginHandles.length = 0;
  }

  subscribe(listener: (event: AtriumClientEvent) => void): () => void {
    this.eventListeners.push(listener);
    return () => {
      const i = this.eventListeners.indexOf(listener);
      if (i >= 0) this.eventListeners.splice(i, 1);
    };
  }

  private emit = (event: AtriumClientEvent): void => {
    for (const listener of this.eventListeners) {
      listener(event);
    }
  };

  health(): Promise<{ ok: true }> {
    return health(this.transport);
  }

  getAgentStatus(): Promise<AtriumPost | null> {
    return getAgentStatus(this.transport);
  }

  async subscribeAuthor(
    username: string,
  ): Promise<{ ok: true; username: string; authorDid: string }> {
    const out = await httpSubscribeAuthor(this.transport, username);
    this.emit({
      type: "author:subscribed",
      username: out.username,
      authorDid: out.authorDid,
      did: this.did,
    });
    return out;
  }

  async unsubscribeAuthor(username: string): Promise<void> {
    await httpUnsubscribeAuthor(this.transport, username);
    this.emit({ type: "author:unsubscribed", username, did: this.did });
  }

  listAuthorSubscriptions(): Promise<AuthorSubscriptionsSnapshot> {
    return httpListAuthorSubscriptions(this.transport);
  }

  async subscribeAuthorTopic(
    username: string,
    topicSlug: string,
  ): Promise<{
    ok: true;
    username: string;
    authorDid: string;
    topicSlug: string;
  }> {
    const out = await httpSubscribeAuthorTopic(this.transport, username, topicSlug);
    this.emit({
      type: "author_topic:subscribed",
      username: out.username,
      authorDid: out.authorDid,
      topicSlug: out.topicSlug,
      did: this.did,
    });
    return out;
  }

  async unsubscribeAuthorTopic(username: string, topicSlug: string): Promise<void> {
    await httpUnsubscribeAuthorTopic(this.transport, username, topicSlug);
    this.emit({
      type: "author_topic:unsubscribed",
      username,
      topicSlug,
      did: this.did,
    });
  }

  async register(
    body: Omit<AtriumRegistrationRequestBody, "did"> & { did?: string } = {},
  ): Promise<AtriumRegistrationResult> {
    const { result, requestDid } = await register(this.transport, body);
    this.emit({ type: "registration:completed", result, requestDid });
    return result;
  }

  async unregister(body: UnregisterBody = {}): Promise<void> {
    await httpUnregister(this.transport, body);
  }

  listInvites(): Promise<AtriumInviteListResponse> {
    return listInvites(this.transport);
  }

  listRelationships(): Promise<AtriumRelationshipListResponse> {
    return httpListRelationships(this.transport);
  }

  getRoom(roomId: string): Promise<AtriumRelationshipItem> {
    return httpGetRoom(this.transport, roomId);
  }

  previewInvite(token: string): Promise<AtriumInvitePreviewResponse> {
    return previewInvite(this.transport, token);
  }

  async updateProfile(patch: AtriumProfilePatch): Promise<AtriumProfile> {
    const profile = await updateProfile(this.transport, patch);
    this.emit({ type: "profile:updated", profile, did: this.did });
    return profile;
  }

  lookupProfileByUsername(username: string): Promise<PublicProfileResult | null> {
    return httpLookupProfileByUsername(this.transport, username);
  }

  lookupProfileByDid(did: string): Promise<PublicProfileResult | null> {
    return httpLookupProfileByDid(this.transport, did);
  }

  async createPost(body: AtriumPostCreateContent): Promise<AtriumPost> {
    const post = await createPost(this.transport, body);
    this.emit({ type: "post:created", post, did: this.did });
    return post;
  }

  async createProbe(body: AtriumProbeCreateInput): Promise<AtriumPost> {
    const post = await httpCreateProbe(this.transport, body);
    this.emit({ type: "post:created", post, did: this.did });
    return post;
  }

  async updatePost(
    id: string,
    patch: Omit<AtriumPostPatch, "authorSignature">,
  ): Promise<AtriumPost> {
    const previous = await httpGetPost(this.transport, id);
    const post = await updatePost(this.transport, id, patch, previous);
    this.emit({ type: "post:updated", post, did: this.did });
    return post;
  }

  async deletePost(id: string): Promise<void> {
    await deletePost(this.transport, id);
    this.emit({ type: "post:deleted", postId: id, did: this.did });
  }

  getPost(id: string): Promise<AtriumPost> {
    return httpGetPost(this.transport, id);
  }

  search(params: AtriumSearchQuery): Promise<AtriumSearchResponse> {
    return httpSearchGet(this.transport, params);
  }

  searchAdvanced(body: AtriumSearchRequest): Promise<AtriumSearchResponse> {
    return httpSearchPost(this.transport, body);
  }

  async createRoom(body: AtriumRoomCreateBody): Promise<AtriumRoomCreateResponse> {
    const out = await httpCreateRoom(this.transport, body);
    this.emit({
      type: "room:created",
      did: this.did,
      roomId: out.roomId,
      hasOpenInvite: out.joinToken !== undefined,
      ...(out.expiresAtMs !== undefined ? { expiresAtMs: out.expiresAtMs } : {}),
      ...(body.targetDid !== undefined ? { targetDid: body.targetDid } : {}),
      ...(body.targetUsername !== undefined ? { targetUsername: body.targetUsername } : {}),
    });
    return out;
  }

  async redeemRoomInvite(body: AtriumRoomJoinRequestBody): Promise<AtriumRoomJoinTicketResponse> {
    const out = await httpRedeemRoomInvite(this.transport, body);
    this.emit({
      type: "room:invite_redeemed",
      did: this.did,
      roomId: out.roomId,
      creatorDid: out.creatorDid,
      ...(out.expiresAtMs !== undefined ? { expiresAtMs: out.expiresAtMs } : {}),
    });
    return out;
  }

  async mintRoomTicket(
    roomId: string,
    body?: AtriumRoomMintTicketBody,
  ): Promise<AtriumRoomTicketResponse> {
    const out = await httpMintRoomTicket(this.transport, roomId, body);
    this.emit({
      type: "room:ticket_minted",
      did: this.did,
      roomId: out.roomId,
      ...(out.expiresAtMs !== undefined ? { expiresAtMs: out.expiresAtMs } : {}),
    });
    return out;
  }

  async leaveRoom(roomId: string): Promise<void> {
    await httpLeaveRoom(this.transport, roomId);
  }

  /**
   * Opens the room negotiation WebSocket and runs OBP with **frame-body E2EE** (always on for this path).
   * Pass **`e2eeChannelBinding`** (e.g. room id) for stronger HKDF domain separation; never derived from the ticket secret.
   */
  async connectRoom(
    options: Omit<ObpWebSocketConnectOptions, "WebSocketCtor">,
    runner: (conn: ObpFrameConnection) => Promise<void>,
  ): Promise<{ sessionOps: SessionOp[]; checkpoint: Checkpoint }> {
    const { webSocketUrl, ...rest } = options;
    const handle = await this.duplex.openNegotiationDuplex({
      webSocketUrl,
      WebSocketCtor: this.WebSocketCtor,
    });
    try {
      return await connectObpFrameChannelSession({ ...rest, channel: handle.channel }, runner);
    } finally {
      handle.dispose();
    }
  }

  async subscribeTopic(topicSlug: string): Promise<{ ok: true; topicSlug: string }> {
    const out = await subscribeTopic(this.transport, topicSlug);
    this.emit({
      type: "topic:subscribed",
      topicSlug: out.topicSlug,
      did: this.did,
    });
    return out;
  }

  async unsubscribeTopic(topicSlug: string): Promise<void> {
    await unsubscribeTopic(this.transport, topicSlug);
    this.emit({ type: "topic:unsubscribed", topicSlug, did: this.did });
  }

  connectInbox(handlers: InboxWsHandlers): Promise<{ close(): void }> {
    return this.duplex.connectInbox(
      {
        base: this.transport.base,
        signer: this.transport.signer,
        now: this.transport.now,
        nonce: this.transport.nonce,
        WebSocketCtor: this.WebSocketCtor,
        emit: this.emit,
      },
      handlers,
    );
  }
}
