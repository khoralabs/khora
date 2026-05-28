import type { AgentSigner } from "@khoralabs/khora-auth";
import type {
  KhoraInviteListResponse,
  KhoraInvitePreviewResponse,
  KhoraPost,
  KhoraPostCreateContent,
  KhoraPostPatch,
  KhoraProfile,
  KhoraProfilePatch,
  KhoraRegistrationRequestBody,
  KhoraRegistrationResult,
  KhoraRelationshipItem,
  KhoraRelationshipListResponse,
  KhoraRoomCreateBody,
  KhoraRoomCreateResponse,
  KhoraRoomJoinRequestBody,
  KhoraRoomJoinTicketResponse,
  KhoraRoomMintTicketBody,
  KhoraRoomTicketResponse,
  KhoraSearchQuery,
  KhoraSearchRequest,
  KhoraSearchResponse,
} from "@khoralabs/khora-contracts";
import {
  createKhoraTransportBundleFromEnv,
  type InboxWsHandlers,
  type KhoraClientEvent,
  type KhoraDuplexTransport,
  type KhoraFetch,
  type KhoraTransportBundle,
  type KhoraUnaryTransport,
} from "@khoralabs/khora-transport";
import type { Checkpoint, SessionOp } from "@khoralabs/obp-v2-session-impl";
import {
  connectObpFrameChannelSession,
  type ObpFrameConnection,
  type ObpWebSocketConnectOptions,
} from "@khoralabs/obp-v2-transport-ws";
import { getAgentStatus } from "./http/agent.ts";
import {
  type AuthorSubscriptionsSnapshot,
  listAuthorSubscriptions as httpListAuthorSubscriptions,
} from "./http/authors.ts";
import { health } from "./http/health.ts";
import { listInvites, previewInvite } from "./http/invites.ts";
import {
  createPost,
  deletePost,
  createSubscription as httpCreateSubscription,
  getPost as httpGetPost,
  type KhoraSubscriptionCreateInput,
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
import { unregister as httpUnregister, type UnregisterBody } from "./http/unregister.ts";
import {
  createKhoraResolvePath,
  type KhoraPluginHandle,
  type KhoraPluginInstaller,
} from "./khora-plugins.ts";

export type {
  KhoraRelationshipItem,
  KhoraRelationshipListResponse,
  KhoraRoomCreateBody,
  KhoraRoomCreateResponse,
  KhoraRoomJoinRequestBody,
  KhoraRoomJoinTicketResponse,
  KhoraRoomMintTicketBody,
  KhoraRoomTicketResponse,
} from "@khoralabs/khora-contracts";
export type {
  ObpFrameConnection,
  ObpWebSocketConnectOptions,
} from "@khoralabs/obp-v2-transport-ws";
export type { AuthorSubscriptionsSnapshot } from "./http/authors.ts";
export type { PublicProfileResult } from "./http/profile.ts";

export type KhoraClientOptions = {
  /** Required unless {@link transportBundle} supplies unary+duplex. */
  baseUrl?: string;
  signer: AgentSigner;
  /** When set, {@link baseUrl} is optional — deploy-selected transports (`KHORA_TRANSPORT`, …). */
  transportBundle?: KhoraTransportBundle;
  fetch?: KhoraFetch;
  WebSocket?: typeof WebSocket;
  nowMs?: () => number;
  nonceFactory?: () => string;
  dataDir?: string;
  plugins?: readonly KhoraPluginInstaller[];
};

export class KhoraClient {
  private readonly transport: KhoraUnaryTransport;
  private readonly duplex: KhoraDuplexTransport;
  private readonly WebSocketCtor: typeof WebSocket;
  private readonly eventListeners: Array<(event: KhoraClientEvent) => void> = [];
  private readonly pluginHandles: KhoraPluginHandle[] = [];

  constructor(options: KhoraClientOptions) {
    let bundle: KhoraTransportBundle;
    if (options.transportBundle !== undefined) {
      bundle = options.transportBundle;
    } else {
      const bu = options.baseUrl?.trim() ?? "";
      if (bu === "") {
        throw new Error("KhoraClient: pass baseUrl or transportBundle");
      }
      bundle = createKhoraTransportBundleFromEnv({
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
    const resolvePath = createKhoraResolvePath(options.dataDir);
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

  subscribe(listener: (event: KhoraClientEvent) => void): () => void {
    this.eventListeners.push(listener);
    return () => {
      const i = this.eventListeners.indexOf(listener);
      if (i >= 0) this.eventListeners.splice(i, 1);
    };
  }

  private emit = (event: KhoraClientEvent): void => {
    for (const listener of this.eventListeners) {
      listener(event);
    }
  };

  health(): Promise<{ ok: true }> {
    return health(this.transport);
  }

  getAgentStatus(): Promise<KhoraPost | null> {
    return getAgentStatus(this.transport);
  }

  listAuthorSubscriptions(): Promise<AuthorSubscriptionsSnapshot> {
    return httpListAuthorSubscriptions(this.transport);
  }

  async register(
    body: Omit<KhoraRegistrationRequestBody, "did"> & { did?: string } = {},
  ): Promise<KhoraRegistrationResult> {
    const { result, requestDid } = await register(this.transport, body);
    this.emit({ type: "registration:completed", result, requestDid });
    return result;
  }

  async unregister(body: UnregisterBody = {}): Promise<void> {
    await httpUnregister(this.transport, body);
  }

  listInvites(): Promise<KhoraInviteListResponse> {
    return listInvites(this.transport);
  }

  listRelationships(): Promise<KhoraRelationshipListResponse> {
    return httpListRelationships(this.transport);
  }

  getRoom(roomId: string): Promise<KhoraRelationshipItem> {
    return httpGetRoom(this.transport, roomId);
  }

  previewInvite(token: string): Promise<KhoraInvitePreviewResponse> {
    return previewInvite(this.transport, token);
  }

  async updateProfile(patch: KhoraProfilePatch): Promise<KhoraProfile> {
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

  async createPost(body: KhoraPostCreateContent): Promise<KhoraPost> {
    const post = await createPost(this.transport, body);
    this.emit({ type: "post:created", post, did: this.did });
    return post;
  }

  async createSubscription(body: KhoraSubscriptionCreateInput): Promise<KhoraPost> {
    const post = await httpCreateSubscription(this.transport, body);
    this.emit({ type: "post:created", post, did: this.did });
    return post;
  }

  async updatePost(id: string, patch: Omit<KhoraPostPatch, "authorSignature">): Promise<KhoraPost> {
    const previous = await httpGetPost(this.transport, id);
    const post = await updatePost(this.transport, id, patch, previous);
    this.emit({ type: "post:updated", post, did: this.did });
    return post;
  }

  async deletePost(id: string): Promise<void> {
    await deletePost(this.transport, id);
    this.emit({ type: "post:deleted", postId: id, did: this.did });
  }

  getPost(id: string): Promise<KhoraPost> {
    return httpGetPost(this.transport, id);
  }

  search(params: KhoraSearchQuery): Promise<KhoraSearchResponse> {
    return httpSearchGet(this.transport, params);
  }

  searchAdvanced(body: KhoraSearchRequest): Promise<KhoraSearchResponse> {
    return httpSearchPost(this.transport, body);
  }

  async createRoom(body: KhoraRoomCreateBody): Promise<KhoraRoomCreateResponse> {
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

  async redeemRoomInvite(body: KhoraRoomJoinRequestBody): Promise<KhoraRoomJoinTicketResponse> {
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
    body?: KhoraRoomMintTicketBody,
  ): Promise<KhoraRoomTicketResponse> {
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
