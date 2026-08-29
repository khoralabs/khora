import type { Signer as RelaySigner } from "@khoralabs/did-key-identity";
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
  KhoraSearchQuery,
  KhoraSearchRequest,
  KhoraSearchResponse,
} from "@khoralabs/khora-contracts";
import { getAgentStatus } from "./http/agent";
import {
  type AuthorSubscriptionsSnapshot,
  listAuthorSubscriptions as httpListAuthorSubscriptions,
} from "./http/authors";
import { health } from "./http/health";
import { listInvites, previewInvite } from "./http/invites";
import {
  createPost,
  deletePost,
  createSubscription as httpCreateSubscription,
  getPost as httpGetPost,
  type KhoraSubscriptionCreateInput,
  updatePost,
} from "./http/posts";
import {
  lookupProfileByDid as httpLookupProfileByDid,
  lookupProfileByUsername as httpLookupProfileByUsername,
  type PublicProfileResult,
  updateProfile,
} from "./http/profile";
import { register } from "./http/register";
import { searchGet as httpSearchGet, searchPost as httpSearchPost } from "./http/search";
import { unregister as httpUnregister, type UnregisterBody } from "./http/unregister";
import {
  createKhoraResolvePath,
  type KhoraPluginHandle,
  type KhoraPluginInstaller,
} from "./khora-plugins";
import {
  createKhoraTransportBundleFromEnv,
  type InboxConnectionHandle,
  type InboxWsHandlers,
  type KhoraClientEvent,
  type KhoraDuplexTransport,
  type KhoraFetch,
  type KhoraTransportBundle,
  type KhoraUnaryTransport,
} from "./transport";

export type { AuthorSubscriptionsSnapshot } from "./http/authors";
export type { PublicProfileResult } from "./http/profile";

export type KhoraClientOptions = {
  /** Required unless {@link transportBundle} supplies unary+duplex. */
  baseUrl?: string;
  signer: RelaySigner;
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

  connectInbox(
    handlers: InboxWsHandlers,
    signers?: readonly RelaySigner[],
  ): Promise<InboxConnectionHandle> {
    return this.duplex.connectInbox(
      {
        base: this.transport.base,
        signers: signers ?? [this.transport.signer],
        now: this.transport.now,
        nonce: this.transport.nonce,
        WebSocketCtor: this.WebSocketCtor,
        emit: this.emit,
      },
      handlers,
    );
  }
}
