import type { AgentSigner } from "@khoralabs/atrium-auth";
import type {
  AtriumInviteListResponse,
  AtriumInvitePreviewResponse,
  AtriumPost,
  AtriumPostCreate,
  AtriumPostPatch,
  AtriumProfile,
  AtriumProfilePatch,
  AtriumRegistrationRequestBody,
  AtriumRegistrationResult,
} from "@khoralabs/atrium-contracts";
import type { AtriumClientEvent } from "./atrium-events.ts";
import {
  type AtriumPluginHandle,
  type AtriumPluginInstaller,
  createAtriumResolvePath,
} from "./atrium-plugins.ts";
import { type AgentSyncSnapshot, fetchAgentSync, getAgentStatus } from "./http/agent.ts";
import { health } from "./http/health.ts";
import { type InboxListResult, type ListInboxParams, listInbox } from "./http/inbox.ts";
import { listInvites, previewInvite } from "./http/invites.ts";
import { createPost, deletePost, updatePost } from "./http/posts.ts";
import { listProbes } from "./http/probes.ts";
import {
  lookupProfileByUsername,
  type ProfileByUsernameResponse,
  updateProfile,
} from "./http/profile.ts";
import { register } from "./http/register.ts";
import { listTopicSubscriptions, subscribeTopic, unsubscribeTopic } from "./http/topics.ts";
import { type AtriumFetch, createHttpTransport, type HttpTransport } from "./http/transport.ts";
import { connectInbox, type InboxWsHandlers } from "./ws/inbox.ts";

export type { AgentStatusSnapshot, AgentSyncSnapshot } from "./http/agent.ts";
export type { InboxListResult, ListInboxParams } from "./http/inbox.ts";
export type { ProfileByUsernameResponse } from "./http/profile.ts";
export type { AtriumFetch } from "./http/transport.ts";
export type { InboxWsHandlers } from "./ws/inbox.ts";

export type AtriumClientOptions = {
  baseUrl: string;
  /** Agent identity used to sign every request including `/v1/register`. */
  signer: AgentSigner;
  fetch?: AtriumFetch;
  WebSocket?: typeof WebSocket;
  /** Override clock (ms) for tests. */
  nowMs?: () => number;
  /** Override nonce generator for tests. */
  nonceFactory?: () => string;
  /** Optional root for plugin `resolvePath` (relative paths join here). */
  dataDir?: string;
  /** Plugins installed synchronously after construction; stopped by {@link AtriumClient.dispose}. */
  plugins?: readonly AtriumPluginInstaller[];
};

export class AtriumClient {
  private readonly transport: HttpTransport;
  private readonly WebSocketCtor: typeof WebSocket;
  private readonly eventListeners: Array<(event: AtriumClientEvent) => void> = [];
  private readonly pluginHandles: AtriumPluginHandle[] = [];

  constructor(options: AtriumClientOptions) {
    this.transport = createHttpTransport({
      baseUrl: options.baseUrl,
      signer: options.signer,
      fetch: options.fetch,
      nowMs: options.nowMs,
      nonceFactory: options.nonceFactory,
    });
    this.WebSocketCtor = options.WebSocket ?? globalThis.WebSocket;
    const resolvePath = createAtriumResolvePath(options.dataDir);
    for (const installer of options.plugins ?? []) {
      this.pluginHandles.push(installer({ client: this, resolvePath }));
    }
  }

  /** DID resolved from the configured signer. */
  get did(): string {
    return this.transport.did;
  }

  /** Stop all plugins (reverse registration order); safe to call multiple times. */
  dispose(): void {
    for (let i = this.pluginHandles.length - 1; i >= 0; i--) {
      const h = this.pluginHandles[i];
      if (h !== undefined) h.stop();
    }
    this.pluginHandles.length = 0;
  }

  /**
   * Subscribe to successful RPC / inbox outcomes. Listeners run **synchronously** in registration
   * order; schedule async work yourself (e.g. `queueMicrotask`).
   */
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

  /** Snapshot of profile, topic subscriptions, and probe posts (requires registration). */
  fetchAgentSync(): Promise<AgentSyncSnapshot> {
    return fetchAgentSync(this.transport);
  }

  /** Current `kind: "status"` post for the agent, if any (`GET /v1/agent/status`). */
  getAgentStatus(): Promise<AtriumPost | null> {
    return getAgentStatus(this.transport);
  }

  async register(
    body: Omit<AtriumRegistrationRequestBody, "did"> & { did?: string } = {},
  ): Promise<AtriumRegistrationResult> {
    const { result, requestDid } = await register(this.transport, body);
    this.emit({ type: "registration:completed", result, requestDid });
    return result;
  }

  listInvites(): Promise<AtriumInviteListResponse> {
    return listInvites(this.transport);
  }

  previewInvite(token: string): Promise<AtriumInvitePreviewResponse> {
    return previewInvite(this.transport, token);
  }

  async updateProfile(patch: AtriumProfilePatch): Promise<AtriumProfile> {
    const profile = await updateProfile(this.transport, patch);
    this.emit({ type: "profile:updated", profile, did: this.did });
    return profile;
  }

  /** Resolve a username to its DID + public profile. Returns `null` if the username is unknown. */
  lookupProfileByUsername(username: string): Promise<ProfileByUsernameResponse | null> {
    return lookupProfileByUsername(this.transport, username);
  }

  async createPost(body: AtriumPostCreate): Promise<AtriumPost> {
    const post = await createPost(this.transport, body);
    this.emit({ type: "post:created", post, did: this.did });
    return post;
  }

  async updatePost(id: string, patch: AtriumPostPatch): Promise<AtriumPost> {
    const post = await updatePost(this.transport, id, patch);
    this.emit({ type: "post:updated", post, did: this.did });
    return post;
  }

  async deletePost(id: string): Promise<void> {
    await deletePost(this.transport, id);
    this.emit({ type: "post:deleted", postId: id, did: this.did });
  }

  /** Topic slugs this agent is currently subscribed to (`GET /v1/topics`). */
  listTopicSubscriptions(): Promise<string[]> {
    return listTopicSubscriptions(this.transport);
  }

  /**
   * Probe posts authored by this agent (`GET /v1/probes`). Pass `{ active: true }` to filter
   * out probes whose `expiresAtMs` is in the past.
   */
  listProbes(params: { active?: boolean } = {}): Promise<AtriumPost[]> {
    return listProbes(this.transport, params);
  }

  async subscribeTopic(topicSlug: string): Promise<{ ok: true; topicSlug: string }> {
    const out = await subscribeTopic(this.transport, topicSlug);
    this.emit({ type: "topic:subscribed", topicSlug: out.topicSlug, did: this.did });
    return out;
  }

  async unsubscribeTopic(topicSlug: string): Promise<void> {
    await unsubscribeTopic(this.transport, topicSlug);
    this.emit({ type: "topic:unsubscribed", topicSlug, did: this.did });
  }

  async listInbox(params: ListInboxParams = {}): Promise<InboxListResult> {
    const result = await listInbox(this.transport, params);
    this.emit({ type: "inbox:list", result, did: this.did });
    return result;
  }

  /**
   * Subscribe to inbox WebSocket (`/v1/inbox/ws`). The upgrade URL carries a one-time signed
   * envelope as search params (`did`, `ts`, `nonce`, `sig`). Returns a handle with `close()`;
   * does not reconnect automatically.
   *
   * Typed `subscribe` events run before legacy `handlers` callbacks for each frame.
   */
  connectInbox(handlers: InboxWsHandlers): Promise<{ close(): void }> {
    return connectInbox(
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
